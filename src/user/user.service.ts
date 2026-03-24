import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/user.dto';
import { genSalt, hash } from 'bcryptjs';
import type { User } from '../../generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { PUBLIC_USER, PublicUser } from 'src/types/types';

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

    // В методе сервиса
    return this.prisma.conversation.findMany({
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
      },
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
    // 🔹 1. Получаем базовых пользователей (используем константу)
    const users = await this.prisma.user.findMany({
      where: {
        ...(currentUserId && { NOT: { id: currentUserId } }),
        OR: [{ username: { startsWith: query, mode: 'insensitive' } }],
      },
      select: PUBLIC_USER_SELECT,
      take: 10,
    });

    // 🔹 2. Если нет текущего юзера — возвращаем как есть (без статусов)
    if (!currentUserId) {
      return users as PublicUser[];
    }

    // 🔹 3. Получаем ВСЕ отношения текущего юзера с найденными пользователями
    // (ОДИН запрос вместо N+1!)
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

    // 🔹 4. Создаём карту статусов для быстрого доступа: userId -> статус
    const statusMap = new Map<
      number,
      {
        hasPendingRequest: boolean;
        isFriend: boolean;
        isRequestReceived: boolean;
      }
    >();

    for (const rel of relationships) {
      // Определяем, кто "другой" пользователь в этой паре
      const otherId =
        rel.senderId === currentUserId ? rel.receiverId : rel.senderId;

      statusMap.set(otherId, {
        hasPendingRequest: rel.status === 'PENDING',
        isFriend: rel.status === 'ACCEPTED',
        // Запрос получен, если я — получатель (receiver), а статус PENDING
        isRequestReceived:
          rel.status === 'PENDING' && rel.receiverId === currentUserId,
      });
    }

    // 🔹 5. Объединяем пользователей с их статусами
    return users.map((user) => ({
      ...user, // 👈 Распаковываем данные из PUBLIC_USER_SELECT
      ...statusMap.get(user.id), // 👈 Добавляем статусы (если есть)
    }));
  }
}
