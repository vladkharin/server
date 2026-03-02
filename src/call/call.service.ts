// src/call/call.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { dmService } from 'src/dm/dm.service';
import {
  MediasoupService,
  RtpCapabilities,
} from 'src/mediasoup/mediasoup.service';

import { WebRtcTransport, Producer } from 'mediasoup';

interface Room {
  transports: Map<string, WebRtcTransport>;
  producers: Map<string, Producer>;
}

@Injectable()
export class callService {
  private readonly logger = new Logger(callService.name);
  private rooms = new Map<number, Room>();

  constructor(
    private dmService: dmService,
    private mediasoupService: MediasoupService,
  ) {}

  // ========================
  // 🔔 СИГНАЛЬНЫЕ СОБЫТИЯ ЗВОНКОВ
  // ========================

  async handleCallRequest(
    client: Socket,
    payload: { conversationId: number },
    userSockets: Map<number, string>,
    server: Server,
  ) {
    const userId = client.user?.id;
    if (!userId) {
      this.logger.warn('handleCallRequest: Unauthorized');
      return { error: 'Unauthorized' };
    }

    const { conversationId } = payload;
    this.logger.log(
      `📞 handleCallRequest от userId=${userId}, conversationId=${conversationId}`,
    );

    const isMember = await this.dmService.isUserInConversation(
      userId,
      conversationId,
    );
    if (!isMember) {
      this.logger.warn(`Пользователь ${userId} не в беседе ${conversationId}`);
      return { error: 'Not a member' };
    }

    await client.join(`room-${conversationId}`);
    this.logger.log(
      `✅ Пользователь ${userId} присоединился к room-${conversationId}`,
    );

    const participants =
      await this.dmService.getConversationParticipants(conversationId);
    const recipients = participants.filter((id) => id !== userId);
    this.logger.log(
      `📤 Отправляем call:incoming ${recipients.length} получателям`,
    );

    for (const recipientId of recipients) {
      const socketId = userSockets.get(recipientId);
      if (socketId) {
        const recipientSocket = server.sockets.sockets.get(socketId);
        if (recipientSocket) {
          recipientSocket.emit('call:incoming', {
            callerId: userId,
            conversationId,
          });
          this.logger.log(
            `📨 Отправлен call:incoming пользователю ${recipientId}`,
          );
        } else {
          this.logger.warn(`Сокет не найден для пользователя ${recipientId}`);
        }
      } else {
        this.logger.warn(`Нет сокета для пользователя ${recipientId}`);
      }
    }

    return { success: true };
  }

  async handleCallAccept(
    client: Socket,
    payload: { conversationId: number },
    server: Server,
  ) {
    const userId = client.user?.id;
    if (!userId) {
      this.logger.warn('handleCallAccept: Unauthorized');
      return { error: 'Unauthorized' };
    }

    const { conversationId } = payload;
    this.logger.log(
      `✅ handleCallAccept от userId=${userId}, conversationId=${conversationId}`,
    );

    const isMember = await this.dmService.isUserInConversation(
      userId,
      conversationId,
    );
    if (!isMember) {
      this.logger.warn(`Пользователь ${userId} не в беседе ${conversationId}`);
      return { error: 'Not a member of conversation' };
    }

    await client.join(`room-${conversationId}`);
    server
      .to(`room-${conversationId}`)
      .emit('call:started', { conversationId });
    this.logger.log(`🎉 Отправлен call:started всем в room-${conversationId}`);

    return { success: true };
  }

  // ========================
  // 📡 MEDIASOUP МЕТОДЫ
  // ========================

  handleGetRouterRtpCapabilities(
    _client: Socket,
    _payload: { conversationId: number },
  ): RtpCapabilities {
    this.logger.log('📥 Получен запрос routerRtpCapabilities');
    const caps = this.mediasoupService.getRouterRtpCapabilities();
    this.logger.log('📤 Отправляем routerRtpCapabilities');
    return caps;
  }

  async handleCreateWebRtcTransport(
    client: Socket,
    payload: { conversationId: number; direction: 'send' | 'recv' },
  ) {
    const userId = client.user?.id;
    if (!userId) throw new Error('Unauthorized');

    const isMember = await this.dmService.isUserInConversation(
      userId,
      payload.conversationId,
    );
    if (!isMember) throw new Error('Not a member');

    if (!this.rooms.has(payload.conversationId)) {
      this.rooms.set(payload.conversationId, {
        transports: new Map(),
        producers: new Map(),
      });
      this.logger.log(`🆕 Создана комната ${payload.conversationId}`);
    }
    const room = this.rooms.get(payload.conversationId)!;

    const transport = await this.mediasoupService.createWebRtcTransport(
      payload.direction,
    );
    const key = `${userId}-${payload.direction}`;
    room.transports.set(key, transport);

    this.logger.log(
      `📤 Создан ${payload.direction} transport для userId=${userId}, id=${transport.id}`,
    );

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async handleConnectTransport(
    _client: Socket,
    payload: {
      conversationId: number;
      transportId: string;
      dtlsParameters: unknown;
    },
  ) {
    const room = this.rooms.get(payload.conversationId);
    if (!room) throw new Error('Room not found');

    const transport = Array.from(room.transports.values()).find(
      (t) => t.id === payload.transportId,
    );
    if (!transport) throw new Error('Transport not found');

    await transport.connect({ dtlsParameters: payload.dtlsParameters as any });
    this.logger.log(`🔌 Подключён transport ${payload.transportId}`);
    return { success: true };
  }

  async handleProduce(
    client: Socket,
    payload: {
      conversationId: number;
      transportId: string;
      kind: 'audio' | 'video';
      rtpParameters: unknown;
    },
    userSockets: Map<number, string>,
    server: Server,
  ) {
    try {
      const userId = client.user?.id;
      if (!userId) throw new Error('Unauthorized');

      const room = this.rooms.get(payload.conversationId);
      if (!room) throw new Error('Room not found');

      const transport = Array.from(room.transports.values()).find(
        (t) => t.id === payload.transportId,
      );
      if (!transport) throw new Error('Transport not found');

      const producer = await transport.produce({
        kind: payload.kind,
        rtpParameters: payload.rtpParameters as any,
      });

      const producerKey = `${userId}-${payload.kind}`;
      room.producers.set(producerKey, producer);

      this.logger.log(
        `📤 Создан producer ${producer.id} (${payload.kind}) для userId=${userId}`,
      );

      const participants = await this.dmService.getConversationParticipants(
        payload.conversationId,
      );
      for (const participantId of participants) {
        if (participantId === userId) continue;
        const socketId = userSockets.get(participantId);
        if (socketId) {
          const participantSocket = server.sockets.sockets.get(socketId);
          if (participantSocket) {
            participantSocket.emit('new-producer', {
              producerId: producer.id,
              peerId: userId,
              conversationId: payload.conversationId,
            });
            this.logger.log(
              `📨 Отправлен new-producer к userId=${participantId}`,
            );
          }
        }
      }

      return { id: producer.id };
    } catch (e) {
      console.error(e);
    }
  }

  async handleConsume(
    client: Socket,
    payload: {
      conversationId: number;
      producerId: string;
      rtpCapabilities: unknown;
    },
  ) {
    const userId = client.user?.id;
    if (!userId) throw new Error('Unauthorized');

    const room = this.rooms.get(payload.conversationId);
    if (!room) throw new Error('Room not found');

    let targetProducer: Producer | null = null;
    for (const producer of room.producers.values()) {
      if (producer.id === payload.producerId) {
        targetProducer = producer;
        break;
      }
    }
    if (!targetProducer) throw new Error('Producer not found');

    const recvKey = `${userId}-recv`;
    const recvTransport = room.transports.get(recvKey);
    if (!recvTransport) {
      throw new Error('Recv transport not found for user');
    }

    const consumer = await recvTransport.consume({
      producerId: targetProducer.id,
      rtpCapabilities: payload.rtpCapabilities as any,
      paused: false,
    });

    this.logger.log(
      `🎧 Создан consumer ${consumer.id} для userId=${userId}, producerId=${payload.producerId}`,
    );

    return {
      id: consumer.id,
      producerId: targetProducer.id,
      kind: targetProducer.kind,
      rtpParameters: consumer.rtpParameters,
    };
  }

  async handleLeaveRoom(
    client: Socket,
    payload: { conversationId: number },
    userSockets: Map<number, string>,
    server: Server,
  ) {
    const userId = client.user?.id;
    if (!userId) return;

    const room = this.rooms.get(payload.conversationId);
    if (!room) return;

    // Закрытие продюсеров
    for (const [key, producer] of room.producers.entries()) {
      if (key.startsWith(`${userId}-`)) {
        producer.close();
        room.producers.delete(key);
        this.logger.log(
          `CloseOperation producer ${producer.id} для userId=${userId}`,
        );
      }
    }

    // Закрытие транспортов
    for (const [key, transport] of room.transports.entries()) {
      if (key.startsWith(`${userId}-`)) {
        transport.close();
        room.transports.delete(key);
        this.logger.log(
          `CloseOperation transport для userId=${userId}, key=${key}`,
        );
      }
    }

    // Уведомление других
    const participants = await this.dmService.getConversationParticipants(
      payload.conversationId,
    );
    for (const participantId of participants) {
      if (participantId === userId) continue;
      const socketId = userSockets.get(participantId);
      if (socketId) {
        const participantSocket = server.sockets.sockets.get(socketId);
        if (participantSocket) {
          participantSocket.emit('producer-closed', {
            producerId: `${userId}-audio`,
          });
          this.logger.log(
            `📨 Отправлен producer-closed к userId=${participantId}`,
          );
        }
      }
    }

    await client.leave(`room-${payload.conversationId}`);
    this.logger.log(
      `📴 Пользователь ${userId} покинул room-${payload.conversationId}`,
    );
    return { success: true };
  }
}
