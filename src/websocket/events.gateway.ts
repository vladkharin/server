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
import { CallService } from 'src/call/call.service';
import { UserService } from 'src/user/user.service';
import { FindUserDto } from 'src/user/dto/user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { PresenceService } from './presence.service';

//node -e "console.log(require('ulid').ulid())"

@WebSocketGateway({ cors: { origin: '*' } })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private presenceService: PresenceService,
    private authService: AuthService,
    private dmService: dmService,
    private callService: CallService,
    private userService: UserService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.query?.token as string | undefined;
    if (!token) return client.disconnect(true);

    try {
      const user = await this.authService.validateToken(token);
      if (!user) return client.disconnect(true);

      client.user = user;

      // 🛑 ПРОВЕРКА: Если у юзера уже есть активный сокет,
      // можно либо отключить старый, либо просто пропустить тяжелую логику.
      const existingSocketId = this.presenceService.getSocketId(user.id);
      if (existingSocketId && existingSocketId !== client.id) {
        console.log(
          `- Переподключение юзера ${user.id}, старый сокет: ${existingSocketId}`,
        );
        // Опционально: можно принудительно закрыть старый сокет
        // this.server.sockets.sockets.get(existingSocketId)?.disconnect();
      }

      // Обновляем Presence сразу
      this.presenceService.set(user.id, client.id);

      // Вход в комнаты
      await client.join(`user:${user.id}`);
      const conversations = await this.prisma.conversationMember.findMany({
        where: { userId: user.id },
        select: { conversationId: true },
      });

      for (const member of conversations) {
        await client.join(`chat:${member.conversationId}`);
      }

      console.log(`✅ User ${user.id} connected (Socket: ${client.id})`);
      client.emit('auth:ready');
    } catch (_e) {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.user?.id as number;
    if (userId) {
      // this.userSockets.delete(userId);
      if (this.presenceService.getSocketId(userId) === client.id) {
        this.presenceService.remove(userId);
        console.log(`📴 Пользователь ${userId} окончательно отключён`);
      } else {
        console.log(`ℹ️ Проигнорирован старый дисконнект для ${userId}`);
      }
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

    return { response: findUsers, id: data.id };
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
    const userId = client.user?.id as number;
    if (!userId) {
      // Отправляем ошибку через то же событие
      return { error: 'Unauthorized', id: data.id };
    }

    try {
      const chats = await this.userService.getUserChats(userId);
      console.log(`📨 Отправляю ${chats.length} чатов`);
      // Отправляем ответ через ТО ЖЕ событие: 'dm:list'
      return { response: chats, id: data.id };
    } catch (error) {
      console.error('🔥 Ошибка:', error);
      return { error: 'Failed to load chats', id: data.id };
    }
  }

  // // === ЗВОНКИ ===
  // @SubscribeMessage('call:request')
  // async handleCallRequest(
  //   @MessageBody() payload: { conversationId: number },
  //   @ConnectedSocket() client: Socket,
  // ) {
  //   return this.callService.handleCallRequest(
  //     client,
  //     payload,
  //     this.userSockets, // ← твой Map<number, string>
  //     this.server, // ← Server из @WebSocketServer()
  //   );
  // }

  // @SubscribeMessage('call:accept')
  // async handleCallAccept(
  //   @MessageBody() payload: { conversationId: number },
  //   @ConnectedSocket() client: Socket,
  // ) {
  //   return this.callService.handleCallAccept(client, payload, this.server);
  // }

  // @SubscribeMessage('mediasoup:getRouterRtpCapabilities')
  // async handleGetRouterRtpCapabilities(
  //   @MessageBody() payload: { conversationId: number; id: string },
  //   @ConnectedSocket() client: Socket,
  // ) {
  //   try {
  //     const rtpCapabilities =
  //       await this.callService.handleGetRouterRtpCapabilities(client, payload);
  //     return {
  //       id: payload.id,
  //       response: rtpCapabilities,
  //     };
  //   } catch (error) {
  //     console.log(error);
  //   }
  // }

  // @SubscribeMessage('mediasoup:createWebRtcTransport')
  // async handleCreateWebRtcTransport(
  //   @MessageBody()
  //   payload: { conversationId: number; direction: 'send' | 'recv'; id: string },
  //   @ConnectedSocket() client: Socket,
  // ) {
  //   try {
  //     const transportInfo = await this.callService.handleCreateWebRtcTransport(
  //       client,
  //       payload,
  //     );
  //     return {
  //       id: payload.id,
  //       response: transportInfo,
  //     };
  //   } catch (error) {
  //     console.log(error);
  //   }
  // }

  // @SubscribeMessage('mediasoup:connectTransport')
  // async handleConnectTransport(
  //   @MessageBody() payload: any,
  //   @ConnectedSocket() client: Socket,
  // ) {
  //   try {
  //     // Ждем выполнения логики в сервисе
  //     const response = await this.callService.handleConnectTransport(
  //       client,
  //       payload,
  //     );

  //     // ОБЯЗАТЕЛЬНО возвращаем объект. NestJS сам отправит его в коллбэк.
  //     return { response };
  //   } catch (error) {
  //     console.error('ошибка в connectTransport:', error);
  //     // return { error: error.message };
  //   }
  // }

  // @SubscribeMessage('mediasoup:produce')
  // async handleProduce(
  //   @MessageBody() payload: any,
  //   @ConnectedSocket() client: Socket,
  // ) {
  //   try {
  //     const result = await this.callService.handleProduce(
  //       client,
  //       payload,
  //       this.userSockets,
  //       this.server,
  //     );
  //     return { response: result }; // Вернет { response: { id: "..." } }
  //   } catch (error) {
  //     console.log(error);
  //     // return { error: error.message };
  //   }
  // }
  // @SubscribeMessage('mediasoup:consume')
  // async handleConsume(
  //   @MessageBody()
  //   payload: {
  //     conversationId: number;
  //     producerId: string;
  //     rtpCapabilities: any;
  //     id: string;
  //   },
  //   @ConnectedSocket() client: Socket,
  // ) {
  //   try {
  //     // ✅ Передаём только client и payload
  //     const result = await this.callService.handleConsume(client, payload);

  //     return {
  //       id: payload.id,
  //       response: result,
  //     };
  //   } catch (error) {
  //     console.error('❌ Consume error:', error);
  //     // ❗ Обязательно отправляй ошибку клиенту
  //   }
  // }

  // @SubscribeMessage('mediasoup:leaveRoom')
  // async handleLeaveRoom(
  //   @MessageBody() payload: { conversationId: number; id: string },
  //   @ConnectedSocket() client: Socket,
  // ) {
  //   try {
  //     const result = await this.callService.handleLeaveRoom(
  //       client,
  //       payload,
  //       this.userSockets,
  //       this.server,
  //     );
  //     return {
  //       id: payload.id,
  //       response: result,
  //     };
  //   } catch (error) {
  //     console.log(error);
  //   }
  // }

  // @SubscribeMessage('call:cancel')
  // async handleCallCancel(
  //   @MessageBody() payload: { conversationId: number },
  //   @ConnectedSocket() client: Socket,
  // ) {
  //   return this.callService.handleCallCancel(
  //     client,
  //     payload,
  //     this.userSockets,
  //     this.server,
  //   );
  // }
}
