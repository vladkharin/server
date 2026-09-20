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

  @SubscribeMessage(REQUESTS.messageEdit)
  async handleMessageEdit(
    @MessageBody() data: { messageId: number; content: string; id?: string },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      const updatedMessage = await this.messageService.editMessage(userId, {
        messageId: data.messageId,
        content: data.content,
      });

      this.server
        .to(`chat:${updatedMessage.conversationId}`)
        .emit(NOTIFICATIONS.messageUpdated, updatedMessage);

      return {
        status: 'ok',
        response: updatedMessage,
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error editing message',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.messageDelete)
  async handleMessageDelete(
    @MessageBody() data: { messageId: number; id?: string },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      const result = await this.messageService.deleteMessage(userId, {
        messageId: data.messageId,
      });

      this.server
        .to(`chat:${result.conversationId}`)
        .emit(NOTIFICATIONS.messageDeleted, {
          messageId: data.messageId,
          conversationId: result.conversationId,
        });

      return {
        status: 'ok',
        response: result,
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error deleting message',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.typingStart)
  handleTypingStart(
    @MessageBody() data: { conversationId: number },
    @ConnectedSocket() client: Socket & { user: { id: number; username: string } },
  ) {
    client.to(`chat:${data.conversationId}`).emit(NOTIFICATIONS.userTyping, {
      userId: client.user.id,
      username: client.user.username,
      conversationId: data.conversationId,
      isTyping: true,
    });
  }

  @SubscribeMessage(REQUESTS.typingStop)
  handleTypingStop(
    @MessageBody() data: { conversationId: number },
    @ConnectedSocket() client: Socket & { user: { id: number; username: string } },
  ) {
    client.to(`chat:${data.conversationId}`).emit(NOTIFICATIONS.userTyping, {
      userId: client.user.id,
      username: client.user.username,
      conversationId: data.conversationId,
      isTyping: false,
    });
  }
}
