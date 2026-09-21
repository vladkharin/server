import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ServerCommunityService } from './server-community.service';
import { NOTIFICATIONS, REQUESTS } from 'src/commands/commands';

@WebSocketGateway()
export class ServerCommunityGateway {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly serverCommunityService: ServerCommunityService,
  ) {}

  @SubscribeMessage(REQUESTS.serverCreate)
  async handleServerCreate(
    @MessageBody() data: { name: string; icon?: string; id?: string },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      const server = await this.serverCommunityService.createServer(
        userId,
        data.name,
        data.icon,
      );

      return {
        status: 'ok',
        response: server,
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error creating server',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.serverList)
  async handleServerList(
    @MessageBody() data: { id?: string },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      const servers = await this.serverCommunityService.getUserServers(userId);
      return {
        status: 'ok',
        response: servers,
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error fetching servers',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.serverGet)
  async handleServerGet(
    @MessageBody() data: { serverId: number; id?: string },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      const server = await this.serverCommunityService.getServer(
        data.serverId,
        userId,
      );
      return {
        status: 'ok',
        response: server,
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error fetching server details',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.serverJoin)
  async handleServerJoin(
    @MessageBody() data: { inviteCode: string; id?: string },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      const server = await this.serverCommunityService.joinServer(
        userId,
        data.inviteCode,
      );
      return {
        status: 'ok',
        response: server,
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error joining server',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.serverInviteInfo)
  async handleServerInviteInfo(
    @MessageBody() data: { inviteCode: string; id?: string },
    @ConnectedSocket() _client: Socket,
  ) {
    try {
      const info = await this.serverCommunityService.getInviteInfo(
        data.inviteCode,
      );
      return {
        status: 'ok',
        response: info,
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error fetching invite info',
        id: data.id,
      };
    }
  }


  @SubscribeMessage(REQUESTS.channelCreate)
  async handleChannelCreate(
    @MessageBody()
    data: {
      serverId: number;
      name: string;
      type?: 'SERVER_CHANNEL' | 'SERVER_VOICE';
      category?: string;
      topic?: string;
      slowmode?: number;
      isAnnouncement?: boolean;
      isPrivate?: boolean;
      id?: string;
    },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      const channel = await this.serverCommunityService.createChannel(
        userId,
        data.serverId,
        data.name,
        data.type,
        {
          category: data.category,
          topic: data.topic,
          slowmode: data.slowmode,
          isAnnouncement: data.isAnnouncement,
          isPrivate: data.isPrivate,
        },
      );

      this.server
        .to(`server:${data.serverId}`)
        .emit(NOTIFICATIONS.channelNew, {
          serverId: data.serverId,
          channel,
        });

      return {
        status: 'ok',
        response: channel,
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error creating channel',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.serverDelete)
  async handleServerDelete(
    @MessageBody() data: { serverId: number; id?: string },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      const result = await this.serverCommunityService.deleteServer(
        userId,
        data.serverId,
      );

      return {
        status: 'ok',
        response: result,
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error deleting server',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.serverLeave)
  async handleServerLeave(
    @MessageBody() data: { serverId: number; id?: string },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      const result = await this.serverCommunityService.leaveServer(
        userId,
        data.serverId,
      );

      return {
        status: 'ok',
        response: result,
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error leaving server',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.channelUpdate)
  async handleChannelUpdate(
    @MessageBody()
    data: {
      channelId: number;
      name?: string;
      type?: 'SERVER_CHANNEL' | 'SERVER_VOICE';
      category?: string;
      topic?: string;
      slowmode?: number;
      isAnnouncement?: boolean;
      isPrivate?: boolean;
      id?: string;
    },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      const channel = await this.serverCommunityService.updateChannel(
        userId,
        data.channelId,
        {
          name: data.name,
          type: data.type,
          category: data.category,
          topic: data.topic,
          slowmode: data.slowmode,
          isAnnouncement: data.isAnnouncement,
          isPrivate: data.isPrivate,
        },
      );

      if (channel.serverId) {
        this.server
          .to(`server:${channel.serverId}`)
          .emit(NOTIFICATIONS.channelUpdated, {
            serverId: channel.serverId,
            channel,
          });
      }

      return {
        status: 'ok',
        response: channel,
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error updating channel',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.channelDelete)
  async handleChannelDelete(
    @MessageBody() data: { channelId: number; id?: string },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      const result = await this.serverCommunityService.deleteChannel(
        userId,
        data.channelId,
      );

      this.server
        .to(`server:${result.serverId}`)
        .emit(NOTIFICATIONS.channelDeleted, {
          serverId: result.serverId,
          channelId: result.channelId,
        });

      return {
        status: 'ok',
        response: result,
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error deleting channel',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.serverMembers)
  async handleServerMembers(
    @MessageBody() data: { serverId: number; id?: string },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      const members = await this.serverCommunityService.getServerMembers(
        data.serverId,
        userId,
      );

      return {
        status: 'ok',
        response: members,
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error fetching server members',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.serverUpdate)
  async handleServerUpdate(
    @MessageBody()
    data: {
      serverId: number;
      name?: string;
      icon?: string;
      id?: string;
    },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      const updated = await this.serverCommunityService.updateServer(
        userId,
        data.serverId,
        { name: data.name, icon: data.icon },
      );

      this.server
        .to(`server:${data.serverId}`)
        .emit(NOTIFICATIONS.serverUpdated, {
          serverId: data.serverId,
          server: updated,
        });

      return {
        status: 'ok',
        response: updated,
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error updating server',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.serverMemberRoleUpdate)
  async handleServerMemberRoleUpdate(
    @MessageBody()
    data: {
      serverId: number;
      targetUserId: number;
      newRole: string;
      id?: string;
    },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      const updated = await this.serverCommunityService.updateMemberRole(
        userId,
        data.serverId,
        data.targetUserId,
        data.newRole,
      );

      this.server
        .to(`server:${data.serverId}`)
        .emit(NOTIFICATIONS.serverMemberUpdated, {
          serverId: data.serverId,
          member: updated,
        });

      return {
        status: 'ok',
        response: updated,
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error updating member role',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.serverMemberKick)
  async handleServerMemberKick(
    @MessageBody()
    data: {
      serverId: number;
      targetUserId: number;
      id?: string;
    },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      const result = await this.serverCommunityService.kickMember(
        userId,
        data.serverId,
        data.targetUserId,
      );

      this.server
        .to(`server:${data.serverId}`)
        .emit(NOTIFICATIONS.serverMemberKicked, {
          serverId: data.serverId,
          targetUserId: data.targetUserId,
        });

      return {
        status: 'ok',
        response: result,
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error kicking member',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.serverInviteRegenerate)
  async handleServerInviteRegenerate(
    @MessageBody()
    data: {
      serverId: number;
      id?: string;
    },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      const result = await this.serverCommunityService.regenerateInviteCode(
        userId,
        data.serverId,
      );

      return {
        status: 'ok',
        response: result,
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error regenerating invite code',
        id: data.id,
      };
    }
  }
}
