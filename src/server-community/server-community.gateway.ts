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

  @SubscribeMessage(REQUESTS.channelCreate)
  async handleChannelCreate(
    @MessageBody()
    data: {
      serverId: number;
      name: string;
      type?: 'SERVER_CHANNEL' | 'SERVER_VOICE';
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
}
