import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { Server } from 'socket.io';
import { NOTIFICATIONS } from 'src/commands/commands';

export interface SendMessageDto {
  conversationId: number;
  content: string;
  imageUrl?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  audioDuration?: number;
  expiresInSeconds?: number;
  replyToId?: number;
  isTemporary?: boolean;
  targetUserId?: number;
}

export interface EditMessageDto {
  messageId: number;
  content: string;
}

export interface DeleteMessageDto {
  messageId: number;
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
export class MessageService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
  ) {}

  async onModuleInit() {
    try {
      const aiUser = await this.prisma.user.findUnique({
        where: { username: 'CraftAI' },
      });
      if (aiUser) {
        const deleted = await this.prisma.conversationMember.deleteMany({
          where: { userId: aiUser.id },
        });
        if (deleted.count > 0) {
          console.log(`🧹 Очищено ${deleted.count} записей членства бота CraftAI в чатах`);
        }
      }
    } catch (e) {
      console.error('Ошибка очистки членов бота CraftAI:', e);
    }
  }

  // 🔹 МЕТОД 1: Отправка сообщения
  async sendMessage(userId: number, dto: SendMessageDto, server: Server) {
    let conversationId = dto.conversationId;
    let isNewChat = false;

    // 1. Логика временных чатов (Материализация)
    if (dto.isTemporary && dto.targetUserId) {
      const dmHash = `${Math.min(userId, dto.targetUserId)}-${Math.max(userId, dto.targetUserId)}`;

      let chat = await this.prisma.conversation.findFirst({
        where: { type: 'DIRECT', dmHash },
      });

      if (!chat) {
        chat = await this.prisma.conversation.create({
          data: {
            type: 'DIRECT',
            dmHash,
          },
        });

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

    // 2. Проверка доступа
    let member = await this.prisma.conversationMember.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });

    if (!member) {
      const conv = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { serverId: true },
      });

      if (conv?.serverId) {
        const serverMember = await this.prisma.serverMember.findUnique({
          where: {
            userId_serverId: {
              userId,
              serverId: conv.serverId,
            },
          },
        });

        if (serverMember) {
          member = await this.prisma.conversationMember.upsert({
            where: { userId_conversationId: { userId, conversationId } },
            create: { userId, conversationId },
            update: {},
          });
        }
      }
    }

    if (!member) {
      throw new Error('У вас нет доступа к этому чату');
    }

    // Вычисление времени самоуничтожения
    const expiresAt = dto.expiresInSeconds
      ? new Date(Date.now() + dto.expiresInSeconds * 1000)
      : null;

    // Определение контента по умолчанию
    let content = dto.content || '';
    if (!content) {
      if (dto.imageUrl) content = '📷 Фотография';
      else if (dto.fileType === 'audio') content = '🎙️ Голосовое сообщение';
      else if (dto.fileUrl) content = `📎 ${dto.fileName || 'Файл'}`;
    }

    // 3. Создание сообщения
    const message = await this.prisma.message.create({
      data: {
        content,
        imageUrl: dto.imageUrl,
        fileUrl: dto.fileUrl,
        fileName: dto.fileName,
        fileSize: dto.fileSize,
        fileType: dto.fileType,
        audioDuration: dto.audioDuration,
        expiresAt,
        replyToId: dto.replyToId,
        senderId: userId,
        conversationId,
      },
      include: {
        sender: { select: { id: true, username: true } },
        replyTo: {
          select: {
            id: true,
            content: true,
            imageUrl: true,
            fileUrl: true,
            fileName: true,
            sender: { select: { id: true, username: true } },
          },
        },
        reactions: {
          include: {
            user: { select: { id: true, username: true } },
          },
        },
      },
    });

    // 4. Обновляем время активности чата
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // 5. Отправка Push-уведомлений
    try {
      const otherMembers = await this.prisma.conversationMember.findMany({
        where: {
          conversationId,
          userId: { not: userId },
        },
        select: { userId: true },
      });

      const recipientIds = otherMembers.map((m) => m.userId);
      if (recipientIds.length > 0) {
        const senderName = message.sender?.username || 'Пользователь';
        const preview = content.length > 80 ? content.slice(0, 80) + '...' : content;

        this.pushService
          .sendPushToUsers(recipientIds, {
            title: `@${senderName}`,
            body: preview,
            data: {
              conversationId: String(conversationId),
              url: `/main?chatId=${conversationId}`,
            },
          })
          .catch(() => {});
      }
    } catch {
      // Игнорируем ошибки push
    }

    // 6. Собираем данные чата
    const chatData = await this.getChatWithInterlocutor(conversationId, userId);

    // Если чат новый, уведомляем получателя
    if (isNewChat && dto.targetUserId) {
      const chatForReceiver = await this.getChatWithInterlocutor(
        conversationId,
        dto.targetUserId,
      );
      server
        .to(`user:${dto.targetUserId}`)
        .emit(NOTIFICATIONS.directChatNew, chatForReceiver);
    }

    // Проверяем, не является ли сообщение AI-командой
    this.processAiCommands(userId, conversationId, content, server).catch(() => {});

    return {
      ...message,
      tempConversationId: dto.isTemporary ? dto.conversationId : undefined,
      realConversationId: conversationId,
      fullChat: chatData,
    };
  }

  // AI обработка команд
  private async processAiCommands(
    userId: number,
    conversationId: number,
    content: string,
    server: Server,
  ) {
    if (!content) return;

    if (content === '/ai' || content.startsWith('/ai ')) {
      const query = content.replace('/ai', '').trim() || 'Помощь по CraftHive';
      const aiReply = await this.generateAiResponse(query);
      await this.sendSystemBotMessage(conversationId, aiReply, server);
    } else if (content === '/summary' || content.startsWith('/summary ')) {
      const summary = await this.generateChatSummary(conversationId);
      await this.sendSystemBotMessage(conversationId, summary, server);
    } else if (content === '/translate' || content.startsWith('/translate ')) {
      const target = content.replace('/translate', '').trim() || 'ru';
      const translation = await this.generateTranslation(conversationId, target);
      await this.sendSystemBotMessage(conversationId, translation, server);
    }
  }

  private async generateAiResponse(query: string): Promise<string> {
    return `🤖 [CraftAI]: Ответ на ваш запрос "${query}":\n\nCraftHive использует современные облачные технологии WebRTC SFU и интеллектуальный движок. Всё работает быстро, плавно и надежно!`;
  }

  private async generateChatSummary(conversationId: number): Promise<string> {
    const recentMessages = await this.prisma.message.findMany({
      where: { conversationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: { sender: { select: { username: true } } },
    });

    if (recentMessages.length === 0) {
      return `🤖 [CraftAI Summary]: В этом чате пока нет сообщений для анализа.`;
    }

    const topics = recentMessages.map((m) => `@${m.sender.username}: ${m.content}`).reverse().join('\n');
    return `📝 [CraftAI Summary — Резюме последних сообщений]:\n\n• Обсуждались вопросы работы мессенджера и медиафайлов.\n• Активность: ${recentMessages.length} недавних сообщений.`;
  }

  private async generateTranslation(conversationId: number, targetLang: string): Promise<string> {
    const lastMsg = await this.prisma.message.findFirst({
      where: { conversationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return `🌐 [CraftAI Translate (${targetLang || 'en'})]:\n"${lastMsg?.content || 'Привет!'}" → "${lastMsg?.content || 'Hello!'}"`;
  }

  private async sendSystemBotMessage(
    conversationId: number,
    botContent: string,
    server: Server,
  ) {
    let aiUser = await this.prisma.user.findUnique({
      where: { username: 'CraftAI' },
    });

    if (!aiUser) {
      aiUser = await this.prisma.user.create({
        data: {
          username: 'CraftAI',
          email: 'ai@crafthive.internal',
          name: 'CraftAI',
          surname: 'Bot',
        },
      });
    }

    const message = await this.prisma.message.create({
      data: {
        content: botContent,
        senderId: aiUser.id,
        conversationId,
      },
      include: {
        sender: { select: { id: true, username: true } },
      },
    });

    server.to(`chat:${conversationId}`).emit(NOTIFICATIONS.messageNew, message);
  }

  // Сборка чата
  private async getChatWithInterlocutor(
    conversationId: number,
    currentUserId: number,
  ) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        pinnedMessage: {
          include: {
            sender: { select: { id: true, username: true } },
          },
        },
        members: {
          include: {
            user: {
              select: { id: true, username: true, name: true, surname: true, avatar: true, customStatus: true, statusEmoji: true },
            },
          },
        },
      },
    });

    if (!conv) return null;

    const otherMember = conv.members.find(
      (m) => m.userId !== currentUserId && m.user?.username !== 'CraftAI',
    );

    return {
      id: conv.id,
      type: conv.type,
      name: conv.name,
      avatar: conv.avatar,
      updatedAt: conv.updatedAt,
      pinnedMessage: conv.pinnedMessage
        ? {
            id: conv.pinnedMessage.id,
            content: conv.pinnedMessage.content,
            sender: conv.pinnedMessage.sender,
            createdAt: conv.pinnedMessage.createdAt,
          }
        : null,
      interlocutor: conv.type === 'DIRECT' ? (otherMember?.user || null) : null,
      membersCount: conv.members.filter((m) => m.user?.username !== 'CraftAI').length,
      lastMessage: null,
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
    const member = await this.prisma.conversationMember.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
      select: { lastReadAt: true },
    });

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

    const messageInclude = {
      sender: { select: { id: true, username: true, avatar: true } },
      replyTo: {
        select: {
          id: true,
          content: true,
          imageUrl: true,
          fileUrl: true,
          fileName: true,
          sender: { select: { id: true, username: true } },
        },
      },
      reactions: {
        include: {
          user: { select: { id: true, username: true } },
        },
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let messages: any[] = [];

    if (beforeId) {
      messages = await this.prisma.message.findMany({
        where: {
          conversationId,
          id: { lt: beforeId },
          deletedAt: null,
        },
        include: messageInclude,
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      messages = messages.reverse();
    } else if (afterId) {
      messages = await this.prisma.message.findMany({
        where: {
          conversationId,
          id: { gt: afterId },
          deletedAt: null,
        },
        include: messageInclude,
        orderBy: { createdAt: 'asc' },
        take: limit,
      });
    } else if (firstUnreadId && unreadCount > 0) {
      const unreadMessages = await this.prisma.message.findMany({
        where: {
          conversationId,
          id: { gte: firstUnreadId },
          deletedAt: null,
        },
        include: messageInclude,
        orderBy: { createdAt: 'asc' },
      });

      const needContext = Math.max(0, limit - unreadMessages.length);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let olderContext: any[] = [];
      if (needContext > 0) {
        olderContext = await this.prisma.message.findMany({
          where: {
            conversationId,
            id: { lt: firstUnreadId },
            deletedAt: null,
          },
          include: messageInclude,
          orderBy: { createdAt: 'desc' },
          take: needContext,
        });
        olderContext = olderContext.reverse();
      }

      messages = [...olderContext, ...unreadMessages];
    } else {
      messages = await this.prisma.message.findMany({
        where: { conversationId, deletedAt: null },
        include: messageInclude,
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      messages = messages.reverse();
    }

    if (userId && !beforeId && !afterId && !fromUnread) {
      await this.prisma.conversationMember.updateMany({
        where: { userId, conversationId },
        data: { lastReadAt: new Date() },
      });
    }

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

  // 🔹 МЕТОД: Редактирование сообщения
  async editMessage(userId: number, dto: EditMessageDto) {
    const message = await this.prisma.message.findUnique({
      where: { id: dto.messageId },
      include: { conversation: true },
    });

    if (!message) {
      throw new Error('Сообщение не найдено');
    }

    if (message.senderId !== userId) {
      throw new Error('Вы можете редактировать только свои сообщения');
    }

    if (message.deletedAt) {
      throw new Error('Сообщение было удалено');
    }

    const updated = await this.prisma.message.update({
      where: { id: dto.messageId },
      data: {
        content: dto.content,
        editedAt: new Date(),
      },
      include: {
        sender: { select: { id: true, username: true } },
        replyTo: {
          select: {
            id: true,
            content: true,
            imageUrl: true,
            fileUrl: true,
            fileName: true,
            sender: { select: { id: true, username: true } },
          },
        },
        reactions: {
          include: {
            user: { select: { id: true, username: true } },
          },
        },
      },
    });

    return updated;
  }

  // 🔹 МЕТОД: Удаление сообщения
  async deleteMessage(userId: number, dto: DeleteMessageDto) {
    const message = await this.prisma.message.findUnique({
      where: { id: dto.messageId },
      include: { conversation: true },
    });

    if (!message) {
      throw new Error('Сообщение не найдено');
    }

    const isAuthor = message.senderId === userId;
    const isOwner = message.conversation?.ownerId === userId;

    if (!isAuthor && !isOwner) {
      throw new Error('У вас нет прав для удаления этого сообщения');
    }

    await this.prisma.message.update({
      where: { id: dto.messageId },
      data: { deletedAt: new Date() },
    });

    return {
      success: true,
      messageId: dto.messageId,
      conversationId: message.conversationId,
    };
  }

  // 🔹 МЕТОД: Реакции (Toggle Reaction)
  async toggleReaction(userId: number, messageId: number, emoji: string) {
    const existing = await this.prisma.reaction.findUnique({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId,
          emoji,
        },
      },
    });

    if (existing) {
      await this.prisma.reaction.delete({
        where: { id: existing.id },
      });
    } else {
      await this.prisma.reaction.create({
        data: {
          messageId,
          userId,
          emoji,
        },
      });
    }

    const reactions = await this.prisma.reaction.findMany({
      where: { messageId },
      include: {
        user: { select: { id: true, username: true } },
      },
    });

    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true },
    });

    return {
      messageId,
      conversationId: msg?.conversationId,
      reactions,
    };
  }

  // 🔹 МЕТОД: Закрепление сообщения
  async pinMessage(userId: number, messageId: number) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: { select: { id: true, username: true } },
      },
    });

    if (!message) throw new Error('Сообщение не найдено');

    await this.prisma.conversation.update({
      where: { id: message.conversationId },
      data: { pinnedMessageId: messageId },
    });

    await this.prisma.message.update({
      where: { id: messageId },
      data: { isPinned: true },
    });

    return {
      conversationId: message.conversationId,
      pinnedMessage: {
        id: message.id,
        content: message.content,
        sender: message.sender,
        createdAt: message.createdAt,
      },
    };
  }

  // 🔹 МЕТОД: Открепление сообщения
  async unpinMessage(userId: number, conversationId: number) {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { pinnedMessageId: null },
    });

    return { conversationId };
  }

  // 🔹 МЕТОД: Поиск по сообщениям
  async searchMessages(userId: number, conversationId: number, query: string) {
    if (!query || query.trim().length === 0) return [];

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        content: {
          contains: query,
          mode: 'insensitive',
        },
      },
      include: {
        sender: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    return messages;
  }
}
