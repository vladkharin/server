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

  async sendMessage(
    userId: number,
    dto: SendMessageDto,
    server: Server, // 👈 Сервер передаётся из гейтвита
  ): Promise<Message> {
    console.log('📤 [MessageService] sendMessage called', {
      userId,
      conversationId: dto.conversationId,
      contentPreview:
        dto.content.slice(0, 50) + (dto.content.length > 50 ? '...' : ''),
      isTemporary: dto.isTemporary,
      targetUserId: dto.targetUserId,
      timestamp: new Date().toISOString(),
    });

    let conversationId = dto.conversationId;

    // 🔹 Логика временных чатов
    if (dto.isTemporary && dto.targetUserId) {
      console.log('🔄 [MessageService] Processing temporary chat', {
        tempConversationId: dto.conversationId,
        targetUserId: dto.targetUserId,
      });

      const existingChat = await this.prisma.conversation.findFirst({
        where: {
          type: 'DIRECT',
          dmHash: `${Math.min(userId, dto.targetUserId)}-${Math.max(userId, dto.targetUserId)}`,
        },
      });

      if (existingChat) {
        console.log('✅ [MessageService] Found existing chat for users', {
          userId,
          targetUserId: dto.targetUserId,
          existingChatId: existingChat.id,
        });
        conversationId = existingChat.id;
      } else {
        console.log('🆕 [MessageService] Creating new DIRECT chat', {
          userId,
          targetUserId: dto.targetUserId,
          dmHash: `${Math.min(userId, dto.targetUserId)}-${Math.max(userId, dto.targetUserId)}`,
        });

        const newChat = await this.prisma.conversation.create({
          data: {
            type: 'DIRECT',
            dmHash: `${Math.min(userId, dto.targetUserId)}-${Math.max(userId, dto.targetUserId)}`,
          },
        });

        // 👇 🔥 ИСПРАВЛЕНО: Используем server (параметр) и dto.targetUserId
        server
          .to(`user:${dto.targetUserId}`) // 👈 Уведомляем того, кому пишут
          .emit(NOTIFICATIONS.directChatNew, {
            response: {
              id: newChat.id,
              type: newChat.type,
              name: null, // Для DIRECT чатов
              avatar: null,
              ownerId: userId, // Тот, кто создал
              members: [
                { userId, username: 'Вы' }, // Можно подгрузить имя отправителя
                { userId: dto.targetUserId, username: 'Собеседник' },
              ],
              createdAt: newChat.createdAt,
            },
          });

        console.log('✨ [MessageService] New chat created', {
          newChatId: newChat.id,
        });

        await this.prisma.conversationMember.createMany({
          data: [
            { userId, conversationId: newChat.id },
            { userId: dto.targetUserId, conversationId: newChat.id },
          ],
        });

        console.log('👥 [MessageService] Added members to chat', {
          chatId: newChat.id,
          members: [userId, dto.targetUserId],
        });

        conversationId = newChat.id;
      }
    }

    // 🔹 Проверка доступа к чату
    console.log('🔐 [MessageService] Checking chat access', {
      userId,
      conversationId,
    });

    const member = await this.prisma.conversationMember.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });

    if (!member) {
      console.error('❌ [MessageService] Access denied', {
        userId,
        conversationId,
      });
      throw new Error('У вас нет доступа к этому чату');
    }

    // 🔹 Создание сообщения
    console.log('💬 [MessageService] Creating message', {
      conversationId,
      senderId: userId,
      contentPreview: dto.content.slice(0, 30) + '...',
    });

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

    console.log('✨ [MessageService] Message created', {
      messageId: message.id,
      conversationId,
      senderId: userId,
      createdAt: message.createdAt,
    });

    // 🔹 Обновление чата
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    console.log('🎯 [MessageService] sendMessage completed', {
      messageId: message.id,
      conversationId,
      timestamp: new Date().toISOString(),
    });

    return message;
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
