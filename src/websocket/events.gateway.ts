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

  @SubscribeMessage('create.dm')
  async handleCreateServer(
    @MessageBody() data: createDmDto & RequestWithId,
    @ConnectedSocket() client: Socket,
  ) {
    return await this.serverService.socketEventCreateServer(client, data);
  }

  // === ЗВОНКИ ===
  @SubscribeMessage('call_request')
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

  @SubscribeMessage('webrtc_signal')
  handleWebRtcSignal(
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

  @SubscribeMessage('call_accept')
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

  @SubscribeMessage('call_end')
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
