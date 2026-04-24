import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  MessageService,
  SendMessageDto,
  GetMessagesDto,
} from './message.service';
import { NOTIFICATIONS, REQUESTS } from 'src/commands/commands';
import { PrismaService } from 'src/prisma/prisma.service';

@WebSocketGateway()
export class MessageGateway {
  @WebSocketServer()
  server!: Server;
  constructor(
    private messageService: MessageService,
    private readonly prisma: PrismaService,
  ) {}
  @SubscribeMessage(REQUESTS.messageSend)
  async handleMessageSend(
    @MessageBody() data: SendMessageDto,
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;

    try {
      const result = await this.messageService.sendMessage(
        userId,
        data,
        this.server,
      );

      if (data.isTemporary) {
        await client.join(`chat:${result?.realConversationId}`);
      }

      this.server
        .to(`chat:${result.realConversationId}`)
        .emit(NOTIFICATIONS.messageNew, result);

      return {
        status: 'ok',
        ...result, // Тут будут tempConversationId, realConversationId и fullChat
      };
    } catch (e) {
      console.error('Ошибка отправки сообщения:', e);
      return { status: 'error', message: e };
    }
  }

  @SubscribeMessage(REQUESTS.messageHistory)
  async handleMessageHistory(
    @MessageBody() data: GetMessagesDto & { id: string },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      // 🔹 Проверка участия в чате
      const member = await this.prisma.conversationMember.findUnique({
        where: {
          userId_conversationId: {
            userId,
            conversationId: data.conversationId,
          },
        },
      });
      if (!member) {
        return {
          error: 'Not a member',
          id: data.id,
        };
      }
      const result = await this.messageService.getMessages({
        conversationId: data.conversationId,
        userId,
        limit: data.limit,
        beforeId: data.beforeId,
        fromUnread: data.fromUnread, // 👈 Передаём флаг
      });
      return {
        response: result,
        id: data.id,
      };
    } catch (error) {
      return {
        error: error,
        id: data.id,
      };
    }
  }
}
