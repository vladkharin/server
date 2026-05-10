import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
} from '@nestjs/websockets';
import { Socket, Server } from 'socket.io';
import { CallService } from './call.service';
import { REQUESTS } from 'src/commands/commands';
import * as mediasoup from 'mediasoup';
import { PresenceService } from 'src/websocket/presence.service';

// Интерфейсы для типизации
interface CallBaseDto {
  id: string;
  conversationId: number;
}

interface CreateTransportDto extends CallBaseDto {
  direction: 'send' | 'recv';
}

interface ConnectTransportDto extends CallBaseDto {
  transportId: string;
  dtlsParameters: mediasoup.types.DtlsParameters;
}

interface ProduceDto extends CallBaseDto {
  transportId: string;
  kind: mediasoup.types.MediaKind;
  rtpParameters: mediasoup.types.RtpParameters;
}

interface ConsumeDto extends CallBaseDto {
  producerId: string;
  rtpCapabilities: mediasoup.types.RtpCapabilities;
  transportId: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
})
export class CallGateway {
  @WebSocketServer()
  server!: Server;

  // Если у тебя EventsGateway хранит userSockets, в идеале передавать их через сервис
  // Но для совместимости со старым кодом сервиса, пока оставим пустую мапу или инжектим зависимость
  private readonly userSockets = new Map<number, string>();

  constructor(
    private readonly callService: CallService,
    private readonly presenceService: PresenceService,
  ) {}

  // --- 1. СИГНАЛИНГ (Начало звонка) ---

  @SubscribeMessage(REQUESTS.callRequest)
  async handleCallRequest(
    @MessageBody() data: { conversationId: number; id: string },
    @ConnectedSocket() client: Socket,
  ) {
    // ВАЖНО: Тут сервис ожидает userSockets.
    // В новой архитектуре лучше хранить их в Shared Service, но для запуска:
    return this.callService.handleCallRequest(
      client,
      data,
      this.presenceService.getAll(),
      this.server,
    );
  }

  @SubscribeMessage(REQUESTS.callAccept)
  async handleCallAccept(
    @MessageBody() data: { conversationId: number; id: string },
    @ConnectedSocket() client: Socket,
  ) {
    return this.callService.handleCallAccept(client, data, this.server);
  }

  // --- 2. MEDIASOUP: ПОДГОТОВКА ---

  @SubscribeMessage(REQUESTS.getRouterRtpCapabilities)
  async handleGetRouterRtpCapabilities(
    @MessageBody() data: { conversationId: number; id: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const caps = await this.callService.handleGetRouterRtpCapabilities(
        client,
        { conversationId: data.conversationId },
      );
      return { response: caps, id: data.id };
    } catch (e: unknown) {
      return {
        error: e instanceof Error ? e.message : 'Unknown error',
        id: data.id,
      };
    }
  }

  // --- 3. MEDIASOUP: ТРАНСПОРТЫ ---

  @SubscribeMessage(REQUESTS.createTransport) // 'mediasoup:createWebRtcTransport'
  async handleCreateTransport(
    @MessageBody() data: CreateTransportDto,
    @ConnectedSocket() client: Socket & { user?: { id: number } },
  ) {
    const userId = client.user?.id;
    if (!userId) return { error: 'Unauthorized', id: data.id };

    try {
      const transportParams = await this.callService.createTransport(
        userId,
        data.conversationId,
      );
      return { response: transportParams, id: data.id };
    } catch (e: unknown) {
      return {
        error: e instanceof Error ? e.message : 'Unknown error',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.connectTransport) // 'mediasoup:connectTransport'
  async handleConnectTransport(
    @MessageBody() data: ConnectTransportDto,
    @ConnectedSocket() client: Socket & { user?: { id: number } },
  ) {
    const userId = client.user?.id;
    if (!userId) return { error: 'Unauthorized', id: data.id };

    try {
      await this.callService.connectTransport(
        userId,
        data.conversationId,
        data.transportId,
        data.dtlsParameters,
      );
      return { response: { success: true }, id: data.id };
    } catch (e: unknown) {
      return {
        error: e instanceof Error ? e.message : 'Unknown error',
        id: data.id,
      };
    }
  }

  // --- 4. MEDIASOUP: МЕДИА (Produce & Consume) ---

  @SubscribeMessage(REQUESTS.produce) // 'mediasoup:produce'
  async handleProduce(
    @MessageBody() data: ProduceDto,
    @ConnectedSocket() client: Socket & { user?: { id: number } },
  ) {
    const userId = client.user?.id;
    if (!userId) return { error: 'Unauthorized', id: data.id };

    try {
      const producerId = await this.callService.produce(
        userId,
        data.conversationId,
        data.transportId,
        data.kind,
        data.rtpParameters,
      );

      // Оповещаем остальных в комнате чата
      client.to(`chat:${data.conversationId}`).emit('call:newProducer', {
        userId,
        producerId,
        kind: data.kind,
        conversationId: data.conversationId,
      });

      return { response: { id: producerId }, id: data.id };
    } catch (e: unknown) {
      return {
        error: e instanceof Error ? e.message : 'Unknown error',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.consume)
  async handleConsume(
    @MessageBody() data: ConsumeDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const result = await this.callService.handleConsume(client, {
        conversationId: data.conversationId,
        producerId: data.producerId,
        rtpCapabilities: data.rtpCapabilities,
        transportId: data.transportId,
      });
      return { response: result, id: data.id };
    } catch (e: unknown) {
      return {
        error: e instanceof Error ? e.message : 'Unknown error',
        id: data.id,
      };
    }
  }

  // --- 5. ЗАВЕРШЕНИЕ ---

  @SubscribeMessage(REQUESTS.leaveRoom)
  async handleLeaveRoom(
    @MessageBody() data: { conversationId: number; id: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const result = await this.callService.handleLeaveRoom(
        client,
        data,
        this.presenceService.getAll(),
        this.server,
      );
      return { response: result, id: data.id };
    } catch (e: unknown) {
      return {
        error: e instanceof Error ? e.message : 'Unknown error',
        id: data.id,
      };
    }
  }
}
