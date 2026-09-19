import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/user.dto';
import { genSalt, hash } from 'bcryptjs';
import type { User } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { PublicUser } from 'src/types/types';
interface FriendshipStatus {
  hasPendingRequest: boolean;
  isFriend: boolean;
  isRequestReceived: boolean;
}
@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Базовые методы (уже были) ---

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

  async getProfile(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        surname: true,
        createdAt: true,
      },
    });
    if (!user) {
      throw new Error('Пользователь не найден');
    }
    return user;
  }

  async updateProfile(userId: number, dto: { username?: string; email?: string; name?: string; surname?: string }) {
    if (dto.username) {
      const existingUser = await this.prisma.user.findFirst({
        where: {
          username: dto.username,
          NOT: { id: userId },
        },
      });
      if (existingUser) {
        throw new Error('Данный никнейм уже занят');
      }
    }

    if (dto.email) {
      const existingEmail = await this.prisma.user.findFirst({
        where: {
          email: dto.email,
          NOT: { id: userId },
        },
      });
      if (existingEmail) {
        throw new Error('Данный Email уже зарегистрирован');
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.username && { username: dto.username.trim() }),
        ...(dto.email && { email: dto.email.trim() }),
        ...(dto.name !== undefined && { name: dto.name?.trim() || null }),
        ...(dto.surname !== undefined && { surname: dto.surname?.trim() || null }),
      },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        surname: true,
        createdAt: true,
      },
    });
  }

  // --- НОВЫЕ МЕТОДЫ ДЛЯ СОЦСЕТЕЙ (OAuth) ---

  /**
   * Найти пользователя по Email (уникальное поле)
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  /**
   * Найти пользователя по ID провайдера (например, Yandex ID)
   */
  async findBySocialId(
    provider: string,
    providerId: string,
  ): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: {
        socialAccounts: {
          some: {
            provider,
            providerId,
          },
        },
      },
    });
  }

  /**
   * Создать нового пользователя через соцсеть.
   * Пароль не указываем, так как вход через OAuth.
   */
  async createSocialUser(data: {
    email: string;
    username: string;
    provider: string;
    providerId: string;
  }) {
    return this.prisma.user.create({
      data: {
        email: data.email,
        username: data.username,
        // password остается null по умолчанию
        socialAccounts: {
          create: {
            provider: data.provider,
            providerId: data.providerId,
          },
        },
      },
    });
  }

  /**
   * Привязать существующий аккаунт пользователя к новой соцсети.
   * Например, если пользователь зашел под тем же Email, но другим способом.
   */
  async linkSocialAccount(
    userId: number,
    provider: string,
    providerId: string,
  ) {
    return this.prisma.socialAccount.create({
      data: {
        userId,
        provider,
        providerId,
      },
    });
  }

  // --- Методы для чатов и поиска (уже были) ---

  async getUserChats(userId: number) {
    const PUBLIC_USER_SELECT = {
      id: true,
      name: true,
      surname: true,
      username: true,
    } as const;

    const conversations = await this.prisma.conversation.findMany({
      where: {
        members: { some: { userId } },
      },
      include: {
        members: {
          include: {
            user: { select: PUBLIC_USER_SELECT },
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return conversations.map((conv) => {
      const otherMember = conv.members.find((m) => m.userId !== userId);
      const lastMessage = conv.messages[0] || null;

      return {
        id: conv.id,
        type: conv.type,
        name: conv.name,
        updatedAt: conv.updatedAt,
        lastMessage: lastMessage
          ? {
              text: lastMessage.content,
              createdAt: lastMessage.createdAt,
            }
          : null,
        interlocutor: conv.type === 'DIRECT' ? (otherMember?.user || null) : null,
        membersCount: conv.members.length,
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

    const users = await this.prisma.user.findMany({
      where: {
        ...(currentUserId && { NOT: { id: currentUserId } }),
        OR: [{ username: { startsWith: query, mode: 'insensitive' } }],
      },
      select: PUBLIC_USER_SELECT,
      take: 10,
    });

    if (!currentUserId) {
      return users.map((user) => ({
        ...user,
        hasPendingRequest: false,
        isFriend: false,
        isRequestReceived: false,
      })) as PublicUser[];
    }

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
    });

    // 2. Указываем тип в Map вместо any
    const statusMap = new Map<number, FriendshipStatus>();

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

    // 3. Явно типизируем возвращаемый объект в map
    return users.map((user): PublicUser => {
      const status = statusMap.get(user.id) || {
        hasPendingRequest: false,
        isFriend: false,
        isRequestReceived: false,
      };

      return {
        id: user.id,
        username: user.username,
        ...status,
      };
    });
  }
}
