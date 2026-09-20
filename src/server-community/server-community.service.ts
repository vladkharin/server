import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from '../websocket/presence.service';

@Injectable()
export class ServerCommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presenceService: PresenceService,
  ) {}

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

  async getInviteInfo(inviteCode: string) {
    const cleanCode = inviteCode.replace(/.*\/invite\//, '').trim();
    const server = await this.prisma.server.findUnique({
      where: { inviteCode: cleanCode },
      include: {
        owner: { select: { id: true, username: true, avatar: true } },
        channels: { select: { id: true, name: true, type: true } },
        _count: { select: { members: true } },
      },
    });

    if (!server) throw new NotFoundException('Приглашение недействительно или сервер удален');

    return {
      id: server.id,
      name: server.name,
      icon: server.icon,
      inviteCode: server.inviteCode,
      membersCount: server._count.members,
      owner: server.owner,
      channelsCount: server.channels.length,
    };
  }

  async joinServer(userId: number, inviteCode: string) {
    const cleanCode = inviteCode.replace(/.*\/invite\//, '').trim();
    const server = await this.prisma.server.findUnique({
      where: { inviteCode: cleanCode },
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

  async deleteServer(userId: number, serverId: number) {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
    });

    if (!server) {
      throw new NotFoundException('Сервер не найден');
    }

    if (server.ownerId !== userId) {
      throw new BadRequestException('Удалить сервер может только его создатель/владелец');
    }

    await this.prisma.server.delete({
      where: { id: serverId },
    });

    return { success: true, serverId };
  }

  async leaveServer(userId: number, serverId: number) {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      include: { channels: true },
    });

    if (!server) {
      throw new NotFoundException('Сервер не найден');
    }

    if (server.ownerId === userId) {
      throw new BadRequestException('Владелец не может покинуть сервер. Вы можете только удалить его.');
    }

    await this.prisma.serverMember.deleteMany({
      where: { userId, serverId },
    });

    // Удаляем из всех каналов сервера
    const channelIds = server.channels.map((c) => c.id);
    if (channelIds.length > 0) {
      await this.prisma.conversationMember.deleteMany({
        where: {
          userId,
          conversationId: { in: channelIds },
        },
      });
    }

    return { success: true, serverId };
  }

  async updateChannel(
    userId: number,
    channelId: number,
    data: { name?: string; type?: 'SERVER_CHANNEL' | 'SERVER_VOICE' },
  ) {
    const channel = await this.prisma.conversation.findUnique({
      where: { id: channelId },
    });

    if (!channel || !channel.serverId) {
      throw new NotFoundException('Канал не найден');
    }

    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId: channel.serverId } },
    });

    if (!member || (member.role !== 'OWNER' && member.role !== 'ADMIN')) {
      throw new BadRequestException('У вас нет прав для редактирования каналов');
    }

    const updated = await this.prisma.conversation.update({
      where: { id: channelId },
      data: {
        ...(data.name && { name: data.name.trim() }),
        ...(data.type && { type: data.type }),
      },
    });

    return updated;
  }

  async deleteChannel(userId: number, channelId: number) {
    const channel = await this.prisma.conversation.findUnique({
      where: { id: channelId },
    });

    if (!channel || !channel.serverId) {
      throw new NotFoundException('Канал не найден');
    }

    const serverId = channel.serverId;

    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
    });

    if (!member || (member.role !== 'OWNER' && member.role !== 'ADMIN')) {
      throw new BadRequestException('У вас нет прав для удаления каналов');
    }

    // Проверяем, что это не единственный канал
    const channelsCount = await this.prisma.conversation.count({
      where: { serverId },
    });

    if (channelsCount <= 1) {
      throw new BadRequestException('Нельзя удалить последний канал сервера');
    }

    await this.prisma.conversation.delete({
      where: { id: channelId },
    });

    return { success: true, channelId, serverId };
  }

  async getServerMembers(serverId: number, userId: number) {
    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
    });

    if (!member) {
      throw new BadRequestException('Вы не состоите на этом сервере');
    }

    const members = await this.prisma.serverMember.findMany({
      where: { serverId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            surname: true,
            avatar: true,
            customStatus: true,
            statusEmoji: true,
            lastSeenAt: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return members.map((m) => ({
      id: m.user.id,
      userId: m.userId,
      username: m.user.username,
      name: m.user.name,
      surname: m.user.surname,
      avatar: m.user.avatar,
      customStatus: m.user.customStatus,
      statusEmoji: m.user.statusEmoji,
      lastSeenAt: m.user.lastSeenAt,
      isOnline: this.presenceService.isOnline(m.user.id),
      role: m.role,
      joinedAt: m.joinedAt,
    }));
  }
}
