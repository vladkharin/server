import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/user.dto';
import { genSalt, hash } from 'bcryptjs';
import type { User } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmailService } from 'src/email/email.service';
import { PublicUser } from 'src/types/types';

interface FriendshipStatus {
  hasPendingRequest: boolean;
  isFriend: boolean;
  isRequestReceived: boolean;
}

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  // --- Базовые методы ---

  async createUser(dto: CreateUserDto) {
    const trimmedUsername = dto.username.trim();
    const trimmedEmail = dto.email.trim().toLowerCase();

    const existingUsername = await this.prisma.user.findFirst({
      where: { username: { equals: trimmedUsername, mode: 'insensitive' } },
    });
    if (existingUsername) {
      throw new ConflictException('Пользователь с таким никнеймом уже существует');
    }

    const existingEmail = await this.prisma.user.findFirst({
      where: { email: { equals: trimmedEmail, mode: 'insensitive' } },
    });
    if (existingEmail) {
      throw new ConflictException('Пользователь с таким email уже зарегистрирован');
    }

    const salt = await genSalt(10);
    const hashPassword = await hash(dto.password, salt);

    // Генерируем 6-значный код подтверждения
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 минут

    const user = await this.prisma.user.create({
      data: {
        username: trimmedUsername,
        email: trimmedEmail,
        password: hashPassword,
        name: dto.name?.trim() || null,
        surname: dto.surname?.trim() || null,
        isEmailVerified: false,
        emailVerificationCode: verificationCode,
        emailVerificationExpires: verificationExpires,
      },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        surname: true,
        isEmailVerified: true,
        createdAt: true,
      },
    });

    // Отправляем код на почту асинхронно
    this.emailService
      .sendVerificationCode(user.email, user.username, verificationCode)
      .catch((err) => console.error('Ошибка отправки verification email:', err));

    return user;
  }

  async verifyEmail(emailOrUsername: string, code: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: emailOrUsername.trim(), mode: 'insensitive' } },
          { username: { equals: emailOrUsername.trim(), mode: 'insensitive' } },
        ],
      },
    });

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    if (user.isEmailVerified) {
      return { success: true, message: 'Email уже подтвержден', isEmailVerified: true };
    }

    if (!user.emailVerificationCode || user.emailVerificationCode !== code.trim()) {
      throw new BadRequestException('Неверный код подтверждения');
    }

    if (user.emailVerificationExpires && user.emailVerificationExpires < new Date()) {
      throw new BadRequestException('Срок действия кода истек. Запросите новый код.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerificationCode: null,
        emailVerificationExpires: null,
      },
    });

    return { success: true, message: 'Email успешно подтвержден!', isEmailVerified: true };
  }

  async resendVerification(emailOrUsername: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: emailOrUsername.trim(), mode: 'insensitive' } },
          { username: { equals: emailOrUsername.trim(), mode: 'insensitive' } },
        ],
      },
    });

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    if (user.isEmailVerified) {
      return { success: true, message: 'Email уже подтвержден' };
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpires = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationCode: verificationCode,
        emailVerificationExpires: verificationExpires,
      },
    });

    await this.emailService.sendVerificationCode(user.email, user.username, verificationCode);
    return { success: true, message: 'Новый код подтверждения отправлен на вашу почту' };
  }

  async requestEmailChange(userId: number, newEmail: string) {
    const trimmedNewEmail = newEmail.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: {
        email: { equals: trimmedNewEmail, mode: 'insensitive' },
        NOT: { id: userId },
      },
    });

    if (existing) {
      throw new ConflictException('Данный адрес электронной почты уже используется другим аккаунтом');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        pendingNewEmail: trimmedNewEmail,
        pendingEmailCode: code,
        pendingEmailExpires: expires,
      },
    });

    await this.emailService.sendEmailChangeCode(trimmedNewEmail, user.username, code);
    return { success: true, message: `Код подтверждения отправлен на ${trimmedNewEmail}` };
  }

  async verifyEmailChange(userId: number, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.pendingNewEmail) {
      throw new BadRequestException('Запрос на смену почты не найден. Запросите код заново.');
    }

    if (!user.pendingEmailCode || user.pendingEmailCode !== code.trim()) {
      throw new BadRequestException('Неверный код подтверждения смены email');
    }

    if (user.pendingEmailExpires && user.pendingEmailExpires < new Date()) {
      throw new BadRequestException('Срок действия кода истек. Запросите смену почты заново.');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: user.pendingNewEmail,
        isEmailVerified: true,
        pendingNewEmail: null,
        pendingEmailCode: null,
        pendingEmailExpires: null,
      },
      select: {
        id: true,
        username: true,
        email: true,
        isEmailVerified: true,
      },
    });

    return {
      success: true,
      message: 'Email успешно обновлен и подтвержден!',
      user: updated,
    };
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
        avatar: true,
        isEmailVerified: true,
        twoFactorEnabled: true,
        customStatus: true,
        statusEmoji: true,
        theme: true,
        createdAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
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
        serverId: null,
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
      const otherMember = conv.members.find(
        (m) => m.userId !== userId && m.user?.username !== 'CraftAI',
      );
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
        membersCount: conv.members.filter((m) => m.user?.username !== 'CraftAI').length,
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
