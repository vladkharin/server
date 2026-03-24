// src/friend/friend.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { FriendStatus } from '../../generated/prisma/client'; // 👈 Из Prisma!
import { PrismaService } from 'src/prisma/prisma.service';

// 👇 Типы для возврата (упрощённые)
export type FriendUser = {
  id: number;
  username: string;
};

export type FriendshipWithUser = {
  id: number;
  status: FriendStatus;
  createdAt: Date;
  updatedAt: Date;
  sender: FriendUser;
  receiver: FriendUser;
};

export type FriendListItem = FriendUser & {
  friendship: {
    id: number;
    status: FriendStatus;
    createdAt: Date;
    isInitiator: boolean;
  };
};

@Injectable()
export class FriendService {
  constructor(private prisma: PrismaService) {}

  async sendRequest(senderId: number, targetId: number) {
    if (senderId === targetId) {
      throw new Error('Нельзя добавить себя в друзья');
    }

    const existing = await this.prisma.friend.findFirst({
      where: {
        OR: [
          { senderId, receiverId: targetId },
          { senderId: targetId, receiverId: senderId },
        ],
      },
    });

    if (existing) {
      return {
        exists: true as const,
        status: existing.status,
        message: 'Запрос уже существует',
      };
    }

    const friend = await this.prisma.friend.create({
      data: {
        senderId,
        receiverId: targetId,
        status: FriendStatus.PENDING,
      },
      include: {
        sender: { select: { id: true, username: true } },
        receiver: { select: { id: true, username: true } },
      },
    });

    return {
      success: true as const,
      friendship: friend as FriendshipWithUser,
    };
  }

  async respondToRequest(userId: number, senderId: number, accept: boolean) {
    const friend = await this.prisma.friend.findUnique({
      where: {
        senderId_receiverId: { senderId, receiverId: userId },
      },
    });

    if (!friend) {
      throw new NotFoundException('Запрос не найден');
    }

    if (accept) {
      const updated = await this.prisma.friend.update({
        where: { id: friend.id },
        data: { status: FriendStatus.ACCEPTED },
        include: {
          sender: { select: { id: true, username: true } },
          receiver: { select: { id: true, username: true } },
        },
      });
      return {
        success: true as const,
        action: 'accepted' as const,
        friendship: updated as FriendshipWithUser,
      };
    } else {
      await this.prisma.friend.delete({ where: { id: friend.id } });
      return { success: true as const, action: 'declined' as const };
    }
  }

  async removeFriend(userId: number, friendId: number) {
    await this.prisma.friend.deleteMany({
      where: {
        OR: [
          { senderId: userId, receiverId: friendId },
          { senderId: friendId, receiverId: userId },
        ],
      },
    });
    return { success: true as const };
  }

  async getFriends(
    userId: number,
    status: FriendStatus = FriendStatus.ACCEPTED,
  ): Promise<FriendListItem[]> {
    const friends = await this.prisma.friend.findMany({
      where: {
        OR: [
          { senderId: userId, status },
          { receiverId: userId, status },
        ],
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
          },
        },
        receiver: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return friends.map((f) => {
      const isSender = f.senderId === userId;
      const other = isSender ? f.receiver : f.sender;

      return {
        id: other.id,
        username: other.username,
        friendship: {
          id: f.id,
          status: f.status,
          createdAt: f.createdAt,
          isInitiator: isSender,
        },
      };
    });
  }

  async getIncomingRequests(userId: number) {
    const requests = await this.prisma.friend.findMany({
      where: { receiverId: userId, status: FriendStatus.PENDING },
      include: {
        sender: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return requests.map((r) => ({
      id: r.sender.id,
      username: r.sender.username,
      friendshipId: r.id,
      createdAt: r.createdAt,
    }));
  }

  async getOutgoingRequests(userId: number) {
    const requests = await this.prisma.friend.findMany({
      where: {
        senderId: userId, // 👈 Я отправитель
        status: FriendStatus.PENDING,
      },
      include: {
        receiver: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return requests.map((r) => ({
      id: r.receiver.id, // 👈 ID получателя
      username: r.receiver.username,
      friendshipId: r.id,
      createdAt: r.createdAt,
    }));
  }
}
