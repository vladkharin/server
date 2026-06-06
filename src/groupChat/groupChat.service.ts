import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Conversation,
  ConversationMember,
  Message,
  User,
} from '@prisma/client';

/**
 * Тип, описывающий структуру Conversation с учетом вложенных данных (include).
 * Это необходимо для устранения ошибок ESLint @typescript-eslint/no-unsafe-assignment.
 */
type ConversationWithDetails = Conversation & {
  members: (ConversationMember & {
    user: Pick<User, 'id' | 'username' | 'name' | 'surname'>;
  })[];
  messages: Message[];
};

@Injectable()
export class GroupChatService {
  constructor(private prisma: PrismaService) {}

  /**
   * Создание новой группы и добавление участников.
   */
  async createGroup(ownerId: number, name: string, participantIds: number[]) {
    // Гарантируем, что создатель включен в список и ID не дублируются
    const uniqueIds = Array.from(new Set([...participantIds, ownerId]));

    return this.prisma.conversation.create({
      data: {
        type: 'GROUP',
        name,
        ownerId,
        members: {
          create: uniqueIds.map((id) => ({
            userId: id,
            isOwner: id === ownerId,
          })),
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                name: true,
                surname: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Получение всех групп пользователя с маппингом в структуру ChatItem.
   */
  async getUserGroups(userId: number) {
    const groups = await this.prisma.conversation.findMany({
      where: {
        type: 'GROUP',
        members: {
          some: { userId },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                name: true,
                surname: true,
              },
            },
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Приведение к типу ConversationWithDetails[] устраняет ошибки unsafe member access
    return (groups as ConversationWithDetails[]).map((group) => ({
      id: group.id,
      type: group.type,
      name: group.name,
      updatedAt: group.updatedAt,
      lastMessage: group.messages[0] || null, // Доступ к [0] теперь безопасен
      interlocutor: null, // Для групп всегда null
      membersCount: group.members.length, // Доступ к .length теперь безопасен
    }));
  }

  /**
   * Проверка, является ли пользователь участником чата.
   */
  async isMember(userId: number, conversationId: number) {
    const member = await this.prisma.conversationMember.findUnique({
      where: {
        userId_conversationId: { userId, conversationId },
      },
    });
    return !!member;
  }

  /**
   * Сохранение сообщения в БД.
   */
  async saveMessage(userId: number, conversationId: number, content: string) {
    const member = await this.isMember(userId, conversationId);
    if (!member) {
      throw new ForbiddenException('Вы не являетесь участником этого чата');
    }

    return this.prisma.message.create({
      data: {
        content,
        senderId: userId,
        conversationId,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            name: true,
            surname: true,
          },
        },
      },
    });
  }

  /**
   * Получение списка ID участников для рассылки.
   */
  async getConversationMembers(conversationId: number) {
    return this.prisma.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true },
    });
  }
}
