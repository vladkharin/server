import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { MediasoupService } from 'src/mediasoup/mediasoup.service';
import * as mediasoup from 'mediasoup';
import { PrismaService } from 'src/prisma/prisma.service';

interface Peer {
  userId: number;
  socketId: string;
  transports: Map<string, mediasoup.types.WebRtcTransport>;
  producers: Map<string, mediasoup.types.Producer>;
  consumers: Map<string, mediasoup.types.Consumer>;
}

interface CallRoom {
  conversationId: number;
  router: mediasoup.types.Router;
  transports: Map<string, mediasoup.types.WebRtcTransport>;
  producers: Map<string, mediasoup.types.Producer>;
  consumers: Map<string, mediasoup.types.Consumer>;
  peers: Map<number, Peer>;
}

@Injectable()
export class CallService {
  private readonly logger = new Logger(CallService.name);
  private rooms = new Map<number, CallRoom>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediasoupService: MediasoupService,
  ) {}

  // --- Вспомогательные методы ---

  async getOrCreateRoom(convId: number): Promise<CallRoom> {
    let room = this.rooms.get(convId);
    if (!room) {
      this.logger.log(`🛠 Создание новой комнаты: ${convId}`);
      const router = await this.mediasoupService.createRouter();
      room = {
        conversationId: convId,
        router: router,
        transports: new Map(), // Инициализируем
        producers: new Map(), // Инициализируем
        consumers: new Map(), // Инициализируем
        peers: new Map(),
      };
      this.rooms.set(convId, room);

      await this.prisma.conversation.update({
        where: { id: convId },
        data: { callActive: true, callStartedAt: new Date() },
      });
    }
    return room;
  }

  // --- Логика сигналинга (из старого EventsGateway) ---

  async handleCallRequest(
    client: Socket,
    payload: { conversationId: number },
    userSockets: Map<number, string>,
    server: Server,
  ) {
    const callerId = client.user?.id as number;
    const { conversationId } = payload;

    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId, userId: { not: callerId } },
    });

    members.forEach((member) => {
      const socketId = userSockets.get(member.userId);
      if (socketId) {
        server.to(socketId).emit('call:incoming', {
          conversationId,
          callerId,
        });
      }
    });
    return { success: true };
  }

  async handleCallAccept(
    client: Socket,
    payload: { conversationId: number },
    server: Server,
  ) {
    const userId = client.user?.id as number;
    const { conversationId } = payload;

    this.logger.log(
      `📞 User ${userId} accepted call in conv ${conversationId}`,
    );

    // 1. Создаем/получаем комнату (роутер)
    await this.getOrCreateRoom(conversationId);

    // 2. Добавляем пользователя в Socket-комнату для трансляций
    await client.join(`chat:${conversationId}`);

    // 3. Уведомляем остальных участников чата, что пользователь присоединился к звонку
    server.to(`chat:${conversationId}`).emit('call:accepted', {
      conversationId,
      userId,
    });

    return { success: true };
  }

  async handleGetRouterRtpCapabilities(
    client: Socket,
    payload: { conversationId: number },
  ) {
    const room = await this.getOrCreateRoom(payload.conversationId);
    return room.router.rtpCapabilities;
  }

  // --- Core Mediasoup Методы (типизированные) ---

  async createTransport(userId: number, convId: number) {
    const room = await this.getOrCreateRoom(convId);
    const transport = await this.mediasoupService.createWebRtcTransport(
      room.router,
    );

    // 1. Сохраняем в ОБЩУЮ карту комнаты (ВАЖНО для produce)
    room.transports.set(transport.id, transport);

    // 2. Сохраняем в карту конкретного юзера
    let peer = room.peers.get(userId);
    if (!peer) {
      peer = {
        userId,
        socketId: '',
        transports: new Map(),
        producers: new Map(),
        consumers: new Map(),
      };
      room.peers.set(userId, peer);
    }
    peer.transports.set(transport.id, transport);

    return {
      id: transport.id,
      iceParameters: transport.iceParameters as mediasoup.types.WebRtcTransport,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async connectTransport(
    userId: number,
    convId: number,
    transportId: string,
    dtlsParameters: mediasoup.types.DtlsParameters,
  ) {
    const room = this.rooms.get(convId);
    const transport = room?.peers.get(userId)?.transports.get(transportId);
    if (!transport) throw new Error('Transport not found');
    await transport.connect({ dtlsParameters });
  }

  async produce(
    userId: number,
    convId: number,
    transportId: string,
    kind: mediasoup.types.MediaKind,
    rtpParameters: mediasoup.types.RtpParameters,
  ) {
    const numericConvId = Number(convId);
    const room = this.rooms.get(numericConvId);
    // if (!room) throw new Error(`Room ${convId} not found`);

    if (!room) {
      this.logger.error(
        `❌ Комната ${numericConvId} вообще не существует в Map!`,
      );
      throw new Error('Room not found');
    }

    this.logger.log(
      `🔎 Ищем транспорт ${transportId} в комнате ${numericConvId}`,
    );
    this.logger.log(
      `📜 Всего транспортов в этой комнате: ${room.transports.size}`,
    );

    const transport = room.transports.get(transportId);
    if (!transport) {
      // Выведи в консоль для отладки, что там вообще есть
      console.log(
        'Available transports in room:',
        Array.from(room.transports.keys()),
      );
      throw new Error(`Transport ${transportId} not found in room ${convId}`);
    }

    const producer = await transport.produce({ kind, rtpParameters });

    // Сохраняем и в комнату, и в пира
    room.producers.set(producer.id, producer);
    room.peers.get(userId)?.producers.set(producer.id, producer);

    this.logger.log(
      `🎤 User ${userId} is now producing ${kind} in room ${convId}`,
    );

    return producer.id;
  }

  async handleConsume(
    client: Socket,
    payload: {
      conversationId: number;
      producerId: string;
      rtpCapabilities: mediasoup.types.RtpCapabilities;
    },
  ) {
    const userId = client.user?.id as number;
    const room = this.rooms.get(payload.conversationId);
    if (!room) throw new Error('Room not found');

    const peer = room.peers.get(userId);
    // Для consume обычно нужен отдельный recvTransport.
    // Предположим, берем первый попавшийся или логика предполагает наличие recvTransport
    const transport = Array.from(peer?.transports.values() || [])[0];
    if (!transport) throw new Error('No transport available for consume');

    const consumer = await transport.consume({
      producerId: payload.producerId,
      rtpCapabilities: payload.rtpCapabilities,
      paused: true,
    });

    // ОБЯЗАТЕЛЬНО: Явный запуск потока
    await consumer.resume();

    peer?.consumers.set(consumer.id, consumer);

    // Можно добавить лог для отладки
    console.log(
      `✅ Consumer resumed: ${consumer.id} for producer: ${payload.producerId}`,
    );

    return {
      id: consumer.id,
      producerId: payload.producerId,
      kind: consumer.kind,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      rtpParameters: consumer.rtpParameters,
    };
  }

  // --- Выход и завершение ---

  async handleLeaveRoom(
    client: Socket,
    payload: { conversationId: number },
    userSockets: Map<number, string>,
    server: Server,
  ) {
    if (!client.user?.id) return;

    const userId = client.user?.id as number;
    await this.cleanupPeer(userId, payload.conversationId, server);
    return { success: true };
  }

  private async cleanupPeer(userId: number, convId: number, server: Server) {
    const room = this.rooms.get(convId);
    if (!room) return;

    const peer = room.peers.get(userId);
    if (peer) {
      peer.transports.forEach((t) => t.close());
      room.peers.delete(userId);
      server.to(`chat:${convId}`).emit('call:peerLeft', { userId });
    }

    if (room.peers.size === 0) {
      room.router.close();
      this.rooms.delete(convId);
      await this.prisma.conversation.update({
        where: { id: convId },
        data: { callActive: false },
      });
    }
  }

  async handleGlobalDisconnect(userId: number, server: Server) {
    for (const convId of this.rooms.keys()) {
      await this.cleanupPeer(userId, convId, server);
    }
  }
}
