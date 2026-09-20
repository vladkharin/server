import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ServerCommunityService {
  constructor(private readonly prisma: PrismaService) {}

  async createServer(userId: number, name: string, icon?: string) {
    if (!name || name.trim().length === 0) {
      throw new BadRequestException('Название сервера обязательно');
    }

    const server = await this.prisma.server.create({
      data: {
        name: name.trim(),
        icon,
        ownerId: userId,
        members: {
          create: {
            userId,
            role: 'OWNER',
          },
        },
        channels: {
          create: [
            {
              name: 'основной',
              type: 'SERVER_CHANNEL',
              ownerId: userId,
            },
            {
              name: 'голосовой',
              type: 'SERVER_VOICE',
              ownerId: userId,
            },
          ],
        },
      },
      include: {
        channels: true,
        members: {
          include: {
            user: { select: { id: true, username: true, avatar: true } },
          },
        },
      },
    });

    // Добавляем создателя во все созданные каналы сервера
    for (const channel of server.channels) {
      await this.prisma.conversationMember.upsert({
        where: {
          userId_conversationId: { userId, conversationId: channel.id },
        },
        create: {
          userId,
          conversationId: channel.id,
        },
        update: {},
      });
    }

    return server;
  }

  async getUserServers(userId: number) {
    const memberships = await this.prisma.serverMember.findMany({
      where: { userId },
      include: {
        server: {
          include: {
            channels: true,
            _count: { select: { members: true } },
          },
        },
      },
    });

    return memberships.map((m) => ({
      id: m.server.id,
      name: m.server.name,
      icon: m.server.icon,
      ownerId: m.server.ownerId,
      inviteCode: m.server.inviteCode,
      channels: m.server.channels,
      membersCount: m.server._count.members,
      role: m.role,
    }));
  }

  async getServer(serverId: number, userId: number) {
    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
    });

    if (!member) {
      throw new BadRequestException('Вы не состоите на этом сервере');
    }

    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      include: {
        channels: {
          include: {
            pinnedMessage: {
              include: { sender: { select: { id: true, username: true } } },
            },
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
                customStatus: true,
                statusEmoji: true,
              },
            },
          },
        },
      },
    });

    if (!server) throw new NotFoundException('Сервер не найден');
    return server;
  }

  async joinServer(userId: number, inviteCode: string) {
    const server = await this.prisma.server.findUnique({
      where: { inviteCode },
      include: { channels: true },
    });

    if (!server) throw new NotFoundException('Сервер по этой ссылке не найден');

    const existingMember = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId: server.id } },
    });

    if (!existingMember) {
      await this.prisma.serverMember.create({
        data: {
          userId,
          serverId: server.id,
          role: 'MEMBER',
        },
      });

      // Добавляем во все каналы сервера
      for (const channel of server.channels) {
        await this.prisma.conversationMember.upsert({
          where: {
            userId_conversationId: { userId, conversationId: channel.id },
          },
          create: {
            userId,
            conversationId: channel.id,
          },
          update: {},
        });
      }
    }

    return this.getServer(server.id, userId);
  }

  async createChannel(
    userId: number,
    serverId: number,
    name: string,
    type: 'SERVER_CHANNEL' | 'SERVER_VOICE' = 'SERVER_CHANNEL',
  ) {
    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
    });

    if (!member || (member.role !== 'OWNER' && member.role !== 'ADMIN')) {
      throw new BadRequestException('У вас нет прав для создания каналов');
    }

    const channel = await this.prisma.conversation.create({
      data: {
        name: name.trim(),
        type,
        serverId,
        ownerId: userId,
      },
    });

    // Добавляем всех участников сервера в канал
    const allMembers = await this.prisma.serverMember.findMany({
      where: { serverId },
      select: { userId: true },
    });

    await this.prisma.conversationMember.createMany({
      data: allMembers.map((m) => ({
        userId: m.userId,
        conversationId: channel.id,
      })),
      skipDuplicates: true,
    });

    return channel;
  }
}
