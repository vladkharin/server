// src/websocket/events.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from 'src/auth/auth.service';

interface MessageDto {
  text: string;
  // другие поля
}

@WebSocketGateway({ cors: { origin: '*' } })
export class EventsGateway {
  @WebSocketServer()
  server!: Server;

  constructor(private authService: AuthService) {}

  @SubscribeMessage('message')
  handleMessage(
    @MessageBody() _data: MessageDto, // ← не используется → _data
    @ConnectedSocket() client: Socket,
  ) {
    // Пример: проверка, что пользователь авторизован
    if (!client.user) {
      throw new WsException('Unauthorized');
    }

    return { status: 'ok' };
  }

  afterInit(_server: Server) {
    console.log('WebSocket сервер инициализирован');
  }

  async handleConnection(client: Socket) {
    const auth = client.handshake.auth;
    const token =
      typeof auth === 'object' && auth && 'token' in auth
        ? (auth.token as string)
        : typeof client.handshake.query?.token === 'string'
          ? client.handshake.query.token
          : undefined;

    if (typeof token !== 'string') {
      console.log('❌ Токен не передан или не строка');

      client.disconnect(true);
      return;
    }

    try {
      const user = await this.authService.validateToken(token);
      client.user = user; // ← теперь безопасно благодаря .d.ts

      console.log('Клиент подключился и авторизован юзер ' + token);
    } catch (_e) {
      console.log('disconnect');
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    console.log('Клиент отключился:', client.id);
  }
}
