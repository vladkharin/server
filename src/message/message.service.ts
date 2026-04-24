// src/message/message.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Message } from '@prisma/client';
import { Server } from 'socket.io';
import { NOTIFICATIONS } from 'src/commands/commands';

export interface SendMessageDto {
  conversationId: number;
  content: string;
  isTemporary?: boolean;
  targetUserId?: number;
}

export interface GetMessagesDto {
  conversationId: number;
  userId: number;
  limit?: number;
  beforeId?: number;
  afterId?: number;
  fromUnread?: boolean;
}

@Injectable()
export class MessageService {
  constructor(private readonly prisma: PrismaService) {}

  // 🔹 МЕТОД 1: Отправка сообщения

  async sendMessage(userId: number, dto: SendMessageDto, server: Server) {
    let conversationId = dto.conversationId;
    let isNewChat = false;

    // 1. Логика временных чатов (Материализация)
    if (dto.isTemporary && dto.targetUserId) {
      // Ищем, не создали ли уже чат пока мы писали сообщение (по dmHash)
      const dmHash = `${Math.min(userId, dto.targetUserId)}-${Math.max(userId, dto.targetUserId)}`;

      let chat = await this.prisma.conversation.findFirst({
        where: { type: 'DIRECT', dmHash },
      });

      if (!chat) {
        // Создаем новый реальный чат в БД
        chat = await this.prisma.conversation.create({
          data: {
            type: 'DIRECT',
            dmHash,
          },
        });

        // Добавляем участников
        await this.prisma.conversationMember.createMany({
          data: [
            { userId, conversationId: chat.id },
            { userId: dto.targetUserId, conversationId: chat.id },
          ],
        });

        isNewChat = true;
      }

      conversationId = chat.id;
    }

    // 2. Проверка доступа (безопасность)
    const member = await this.prisma.conversationMember.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });

    if (!member) {
      throw new Error('У вас нет доступа к этому чату');
    }

    // 3. Создание сообщения
    const message = await this.prisma.message.create({
      data: {
        content: dto.content,
        senderId: userId,
        conversationId,
      },
      include: {
        sender: { select: { id: true, username: true } },
      },
    });

    // 4. Обновляем время активности чата
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // 5. Собираем данные для фронтенда
    const chatData = await this.getChatWithInterlocutor(conversationId, userId);

    // Если чат новый, уведомляем ПОЛУЧАТЕЛЯ
    if (isNewChat && dto.targetUserId) {
      const chatForReceiver = await this.getChatWithInterlocutor(
        conversationId,
        dto.targetUserId,
      );
      server
        .to(`user:${dto.targetUserId}`)
        .emit(NOTIFICATIONS.directChatNew, chatForReceiver);
    }

    // Возвращаем объект "склейки"
    return {
      ...message,
      tempConversationId: dto.isTemporary ? dto.conversationId : undefined,
      realConversationId: conversationId,
      fullChat: chatData, // Чтобы фронт обновил весь объект чата в сторе
    };
  }

  // Вспомогательный метод для сборки ChatItem (добавь в этот же сервис)
  private async getChatWithInterlocutor(
    conversationId: number,
    currentUserId: number,
  ) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, username: true, name: true, surname: true },
            },
          },
        },
      },
    });

    if (!conv) return null;

    const otherMember = conv.members.find((m) => m.userId !== currentUserId);

    return {
      id: conv.id,
      type: conv.type,
      updatedAt: conv.updatedAt,
      interlocutor: otherMember?.user || null,
      lastMessage: null, // Можно заполнить при желании
    };
  }

  // 🔹 МЕТОД 2: Получение сообщений
  async getMessages({
    conversationId,
    userId,
    limit = 50,
    beforeId,
    afterId,
    fromUnread = false,
  }: GetMessagesDto) {
    // 🔹 1. Получаем lastReadAt
    const member = await this.prisma.conversationMember.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
      select: { lastReadAt: true },
    });

    // 🔹 2. Находим первое непрочитанное
    let unreadCount = 0;
    let firstUnreadId: number | null = null;

    if (member?.lastReadAt) {
      const unread = await this.prisma.message.findFirst({
        where: {
          conversationId,
          createdAt: { gt: member.lastReadAt },
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });

      firstUnreadId = unread?.id ?? null;

      unreadCount = await this.prisma.message.count({
        where: {
          conversationId,
          createdAt: { gt: member.lastReadAt },
        },
      });
    }

    // 🔹 3. Умная логика загрузки
    let messages: Message[] = [];

    if (beforeId) {
      messages = await this.prisma.message.findMany({
        where: {
          conversationId,
          id: { lt: beforeId },
        },
        include: {
          sender: { select: { id: true, username: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      messages = messages.reverse();
    } else if (afterId) {
      messages = await this.prisma.message.findMany({
        where: {
          conversationId,
          id: { gt: afterId },
        },
        include: {
          sender: { select: { id: true, username: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });
    } else if (firstUnreadId && unreadCount > 0) {
      const unreadMessages = await this.prisma.message.findMany({
        where: {
          conversationId,
          id: { gte: firstUnreadId },
        },
        include: {
          sender: { select: { id: true, username: true } },
        },
        orderBy: { createdAt: 'asc' },
      });

      const needContext = Math.max(0, limit - unreadMessages.length);

      let olderContext: Message[] = [];
      if (needContext > 0) {
        olderContext = await this.prisma.message.findMany({
          where: {
            conversationId,
            id: { lt: firstUnreadId },
          },
          include: {
            sender: { select: { id: true, username: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: needContext,
        });
        olderContext = olderContext.reverse();
      }

      messages = [...olderContext, ...unreadMessages];
    } else {
      messages = await this.prisma.message.findMany({
        where: { conversationId },
        include: {
          sender: { select: { id: true, username: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      messages = messages.reverse();
    }

    // 🔹 4. Обновляем lastReadAt
    if (userId && !beforeId && !afterId && !fromUnread) {
      await this.prisma.conversationMember.updateMany({
        where: { userId, conversationId },
        data: { lastReadAt: new Date() },
      });
    }

    // 🔹 5. Возвращаем результат
    return {
      messages,
      hasMoreUp:
        !afterId &&
        (beforeId ? messages.length === limit : messages[0]?.id > 1),
      oldestId: messages[0]?.id,
      hasMoreDown:
        !beforeId && messages.length < limit
          ? false
          : unreadCount > limit || messages.length === limit,
      newestId: messages[messages.length - 1]?.id,
      unreadCount,
      firstUnreadId,
      loadedFromUnread:
        !beforeId && !afterId && !!firstUnreadId && unreadCount > 0,
    };
  }
}
