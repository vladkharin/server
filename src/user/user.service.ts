import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/user.dto';
import { genSalt, hash } from 'bcryptjs';
import type { User } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { PublicUser } from 'src/types/types';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(dto: CreateUserDto) {
    const salt = await genSalt(10);
    const hashPassword = await hash(dto.password, salt);
    const data = { ...dto, password: hashPassword };

    return this.prisma.user.create({ data });
  }

  async findOne(username: string) {
    return await this.prisma.user.findFirst({
      where: { username: username },
    });
  }

  async findById(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async getUserChats(userId: number) {
    const PUBLIC_USER_SELECT = {
      id: true,
      name: true,
      surname: true,
      username: true,
    } as const;

    const conversations = await this.prisma.conversation.findMany({
      where: {
        members: {
          some: { userId },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: PUBLIC_USER_SELECT,
            },
          },
        },
        // Можно сразу подтянуть последнее сообщение для превью
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    // Трансформируем вывод
    return conversations.map((conv) => {
      // Находим "другого" пользователя (не меня)
      // Если это групповой чат, здесь будет массив других людей
      const otherMember = conv.members.find((m) => m.userId !== userId);
      const lastMessage = conv.messages[0] || null;

      return {
        id: conv.id,
        updatedAt: conv.updatedAt,
        lastMessage: lastMessage
          ? {
              text: lastMessage.content,
              createdAt: lastMessage.createdAt,
            }
          : null,
        // Выносим данные собеседника на верхний уровень
        interlocutor: otherMember?.user || null,
      };
    });
  }

  async searchUsers(
    query: string,
    currentUserId?: number,
  ): Promise<PublicUser[]> {
    const PUBLIC_USER_SELECT = {
      id: true,
      username: true,
    } as const;

    // 🔹 1. Получаем базовых пользователей
    const users = await this.prisma.user.findMany({
      where: {
        ...(currentUserId && { NOT: { id: currentUserId } }),
        OR: [{ username: { startsWith: query, mode: 'insensitive' } }],
      },
      select: PUBLIC_USER_SELECT,
      take: 10,
    });

    // 🔹 2. Если нет текущего юзера — возвращаем список с дефолтными статусами
    if (!currentUserId) {
      return users.map((user) => ({
        ...user,
        hasPendingRequest: false,
        isFriend: false,
        isRequestReceived: false,
      })) as PublicUser[];
    }

    // 🔹 3. Получаем отношения текущего юзера с найденными пользователями
    const relationships = await this.prisma.friend.findMany({
      where: {
        OR: [
          {
            senderId: currentUserId,
            receiverId: { in: users.map((u) => u.id) },
          },
          {
            receiverId: currentUserId,
            senderId: { in: users.map((u) => u.id) },
          },
        ],
      },
      select: {
        senderId: true,
        receiverId: true,
        status: true,
      },
    });

    // 🔹 4. Создаём карту статусов
    const statusMap = new Map<
      number,
      {
        hasPendingRequest: boolean;
        isFriend: boolean;
        isRequestReceived: boolean;
      }
    >();

    for (const rel of relationships) {
      const otherId =
        rel.senderId === currentUserId ? rel.receiverId : rel.senderId;

      statusMap.set(otherId, {
        hasPendingRequest: rel.status === 'PENDING',
        isFriend: rel.status === 'ACCEPTED',
        isRequestReceived:
          rel.status === 'PENDING' && rel.receiverId === currentUserId,
      });
    }

    // 🔹 5. Объединяем данные, гарантируя наличие всех полей
    return users.map((user) => {
      const status = statusMap.get(user.id) || {
        hasPendingRequest: false,
        isFriend: false,
        isRequestReceived: false,
      };

      return {
        ...user,
        ...status,
      };
    });
  }
}
