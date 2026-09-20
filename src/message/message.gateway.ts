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
        ...result,
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
      let member = await this.prisma.conversationMember.findUnique({
        where: {
          userId_conversationId: {
            userId,
            conversationId: data.conversationId,
          },
        },
      });

      if (!member) {
        const conversation = await this.prisma.conversation.findUnique({
          where: { id: data.conversationId },
          select: { serverId: true },
        });

        if (conversation?.serverId) {
          const serverMember = await this.prisma.serverMember.findUnique({
            where: {
              userId_serverId: {
                userId,
                serverId: conversation.serverId,
              },
            },
          });

          if (serverMember) {
            member = await this.prisma.conversationMember.upsert({
              where: {
                userId_conversationId: {
                  userId,
                  conversationId: data.conversationId,
                },
              },
              create: {
                userId,
                conversationId: data.conversationId,
              },
              update: {},
            });
            await client.join(`chat:${data.conversationId}`);
          }
        }
      }

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
        fromUnread: data.fromUnread,
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

  @SubscribeMessage(REQUESTS.reactionToggle)
  async handleReactionToggle(
    @MessageBody() data: { messageId: number; emoji: string; id?: string },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      const result = await this.messageService.toggleReaction(
        userId,
        data.messageId,
        data.emoji,
      );

      if (result.conversationId) {
        this.server
          .to(`chat:${result.conversationId}`)
          .emit(NOTIFICATIONS.reactionUpdated, result);
      }

      return {
        status: 'ok',
        response: result,
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error toggling reaction',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.messagePin)
  async handleMessagePin(
    @MessageBody() data: { messageId: number; id?: string },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      const result = await this.messageService.pinMessage(userId, data.messageId);

      this.server
        .to(`chat:${result.conversationId}`)
        .emit(NOTIFICATIONS.messagePinned, result);

      return {
        status: 'ok',
        response: result,
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error pinning message',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.messageUnpin)
  async handleMessageUnpin(
    @MessageBody() data: { conversationId: number; id?: string },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      const result = await this.messageService.unpinMessage(
        userId,
        data.conversationId,
      );

      this.server
        .to(`chat:${data.conversationId}`)
        .emit(NOTIFICATIONS.messagePinned, {
          conversationId: data.conversationId,
          pinnedMessage: null,
        });

      return {
        status: 'ok',
        response: result,
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error unpinning message',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.messageSearch)
  async handleMessageSearch(
    @MessageBody() data: { conversationId: number; query: string; id?: string },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      const results = await this.messageService.searchMessages(
        userId,
        data.conversationId,
        data.query,
      );

      return {
        status: 'ok',
        response: results,
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error searching messages',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.typingStart)
  handleTypingStart(
    @MessageBody() data: { conversationId: number; id?: string },
    @ConnectedSocket() client: Socket & { user: { id: number; username: string } },
  ) {
    client.to(`chat:${data.conversationId}`).emit(NOTIFICATIONS.userTyping, {
      userId: client.user.id,
      username: client.user.username,
      conversationId: data.conversationId,
      isTyping: true,
    });
    return { status: 'ok', id: data.id };
  }

  @SubscribeMessage(REQUESTS.typingStop)
  handleTypingStop(
    @MessageBody() data: { conversationId: number; id?: string },
    @ConnectedSocket() client: Socket & { user: { id: number; username: string } },
  ) {
    client.to(`chat:${data.conversationId}`).emit(NOTIFICATIONS.userTyping, {
      userId: client.user.id,
      username: client.user.username,
      conversationId: data.conversationId,
      isTyping: false,
    });
    return { status: 'ok', id: data.id };
  }
}
