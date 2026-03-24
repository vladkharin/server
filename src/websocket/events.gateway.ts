// src/websocket/events.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from 'src/auth/auth.service';
import { dmService } from 'src/dm/dm.service';
import { createDmDto } from 'src/dm/dto/dm.dto';
import { RequestWithId } from 'src/common/utils/request-with-id.interface';
import { callService } from 'src/call/call.service';
import { UserService } from 'src/user/user.service';
import { FindUserDto } from 'src/user/dto/user.dto';

//node -e "console.log(require('ulid').ulid())"

@WebSocketGateway({ cors: { origin: '*' } })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private userSockets = new Map<number, string>();

  constructor(
    private authService: AuthService,
    private dmService: dmService,
    private callService: callService,
    private userService: UserService,
  ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.query?.token as string | undefined;
    if (!token) return client.disconnect(true);

    try {
      const user = await this.authService.validateToken(token);
      if (!user) return client.disconnect(true);

      client.user = user;

      await client.join(`user:${user.id}`);
      console.log(
        `✅ User ${user.id} connected and joined room user:${user.id}`,
      );

      this.userSockets.set(user.id, client.id);
      console.log(`✅ Пользователь ${user.id} подключён`);

      client.emit('auth:ready');
    } catch (_e) {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.user?.id;
    if (userId) {
      this.userSockets.delete(userId);
      console.log(`📴 Пользователь ${userId} отключён`);
    }
  }

  // == Пользователи ===

  @SubscribeMessage('users:find')
  async handleFindUsers(
    @MessageBody() data: FindUserDto & RequestWithId,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.user?.id as number;

    if (!userId) {
      return;
    }

    const findUsers = await this.userService.searchUsers(data.name, userId);

    client.emit('users:find', { response: findUsers, id: data.id });
  }

  // === Чаты ===

  @SubscribeMessage('dm:create')
  async handleDmCreate(
    @MessageBody() data: createDmDto & RequestWithId,
    @ConnectedSocket() client: Socket,
  ) {
    return await this.dmService.socketEventDmCreate(client, data);
  }

  @SubscribeMessage('dm:list')
  async handleDmList(
    @MessageBody() data: RequestWithId,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.user?.id;
    if (!userId) {
      // Отправляем ошибку через то же событие
      client.emit('dm:list', { error: 'Unauthorized', id: data.id });
      return;
    }

    try {
      const chats = await this.userService.getUserChats(userId);
      console.log(`📨 Отправляю ${chats.length} чатов`);
      // Отправляем ответ через ТО ЖЕ событие: 'dm:list'
      client.emit('dm:list', { response: chats, id: data.id });
    } catch (error) {
      console.error('🔥 Ошибка:', error);
      client.emit('dm:list', { error: 'Failed to load chats', id: data.id });
    }
  }

  // === ЗВОНКИ ===
  @SubscribeMessage('call:request')
  async handleCallRequest(
    @MessageBody() payload: { conversationId: number },
    @ConnectedSocket() client: Socket,
  ) {
    return this.callService.handleCallRequest(
      client,
      payload,
      this.userSockets, // ← твой Map<number, string>
      this.server, // ← Server из @WebSocketServer()
    );
  }

  @SubscribeMessage('call:accept')
  async handleCallAccept(
    @MessageBody() payload: { conversationId: number },
    @ConnectedSocket() client: Socket,
  ) {
    return this.callService.handleCallAccept(client, payload, this.server);
  }

  @SubscribeMessage('mediasoup:getRouterRtpCapabilities')
  async handleGetRouterRtpCapabilities(
    @MessageBody() payload: { conversationId: number; id: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const rtpCapabilities =
        await this.callService.handleGetRouterRtpCapabilities(client, payload);
      client.emit('mediasoup:getRouterRtpCapabilities', {
        id: payload.id,
        response: rtpCapabilities,
      });
    } catch (error) {
      console.log(error);
    }
  }

  @SubscribeMessage('mediasoup:createWebRtcTransport')
  async handleCreateWebRtcTransport(
    @MessageBody()
    payload: { conversationId: number; direction: 'send' | 'recv'; id: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const transportInfo = await this.callService.handleCreateWebRtcTransport(
        client,
        payload,
      );
      client.emit('mediasoup:createWebRtcTransport', {
        id: payload.id,
        response: transportInfo,
      });
    } catch (error) {
      console.log(error);
    }
  }

  @SubscribeMessage('mediasoup:connectTransport')
  async handleConnectTransport(
    @MessageBody()
    payload: {
      conversationId: number;
      transportId: string;
      dtlsParameters: any;
      id: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const result = await this.callService.handleConnectTransport(
        client,
        payload,
      );
      client.emit('mediasoup:connectTransport', {
        id: payload.id,
        response: result,
      });
    } catch (error) {
      console.log(error);
    }
  }

  @SubscribeMessage('mediasoup:produce')
  async handleProduce(
    @MessageBody()
    payload: {
      conversationId: number;
      transportId: string;
      kind: 'audio' | 'video';
      rtpParameters: any;
      id: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const result = await this.callService.handleProduce(
        client,
        payload,
        this.userSockets,
        this.server,
      );
      client.emit('mediasoup:produce', {
        id: payload.id,
        response: result,
      });
    } catch (error) {
      console.log(error);
    }
  }

  @SubscribeMessage('mediasoup:consume')
  async handleConsume(
    @MessageBody()
    payload: {
      conversationId: number;
      producerId: string;
      rtpCapabilities: any;
      id: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      // ✅ Передаём только client и payload
      const result = await this.callService.handleConsume(client, payload);

      client.emit('mediasoup:consume', {
        id: payload.id,
        response: result,
      });
    } catch (error) {
      console.error('❌ Consume error:', error);
      // ❗ Обязательно отправляй ошибку клиенту
    }
  }

  @SubscribeMessage('mediasoup:leaveRoom')
  async handleLeaveRoom(
    @MessageBody() payload: { conversationId: number; id: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const result = await this.callService.handleLeaveRoom(
        client,
        payload,
        this.userSockets,
        this.server,
      );
      client.emit('mediasoup:leaveRoom', {
        id: payload.id,
        response: result,
      });
    } catch (error) {
      console.log(error);
    }
  }
}
