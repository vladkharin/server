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
import { WebRtcSignalPayload } from 'src/types/types';
import { Conversation } from '@prisma/client';
import { UserService } from 'src/user/user.service';

//node -e "console.log(require('ulid').ulid())"

@WebSocketGateway({ cors: { origin: '*' } })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private userSockets = new Map<number, string>();

  constructor(
    private authService: AuthService,
    private serverService: dmService,
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
      this.userSockets.set(user.id, client.id);
      console.log(`✅ Пользователь ${user.id} подключён`);
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

  // === Чаты ===

  @SubscribeMessage('dm:create')
  async handleDmCreate(
    @MessageBody() data: createDmDto & RequestWithId,
    @ConnectedSocket() client: Socket,
  ) {
    return await this.serverService.socketEventCreateServer(client, data);
  }

  @SubscribeMessage('dm:list')
  async handleDmList(
    @MessageBody() data: Conversation[] & RequestWithId,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.user?.id;
    if (!userId) {
      return;
    }

    return await this.userService.getUserChats(userId);
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
      this.userSockets,
      this.server,
    );
  }

  @SubscribeMessage('call:signal')
  handleCallSignal(
    @MessageBody() payload: WebRtcSignalPayload,
    @ConnectedSocket() client: Socket,
  ) {
    return this.callService.handleWebRtcSignal(
      client,
      payload,
      this.userSockets,
      this.server,
    );
  }

  @SubscribeMessage('call:accept')
  async handleCallAccept(
    @MessageBody() payload: { conversationId: number },
    @ConnectedSocket() client: Socket,
  ) {
    return this.callService.handleCallAccept(
      client,
      payload,
      this.userSockets,
      this.server,
    );
  }

  @SubscribeMessage('call:end')
  async handleCallEnd(
    @MessageBody() payload: { conversationId: number },
    @ConnectedSocket() client: Socket,
  ) {
    return this.callService.handleCallEnd(
      client,
      payload,
      this.userSockets,
      this.server,
    );
  }
}
