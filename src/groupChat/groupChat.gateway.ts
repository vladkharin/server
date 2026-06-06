import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { NOTIFICATIONS, REQUESTS } from 'src/commands/commands';
import { GroupChatService } from './groupChat.service';

// Определение интерфейса для устранения ошибок "unsafe member access"
interface FullGroup {
  id: number;
  name: string | null;
  type: string;
  updatedAt: Date;
  members: {
    userId: number;
    user: {
      id: number;
      username: string;
      name: string | null;
      surname: string | null;
      avatar: string | null;
    };
  }[];
}

@WebSocketGateway()
export class GroupGateway {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly groupService: GroupChatService) {}

  @SubscribeMessage(REQUESTS.groupChatCreate)
  async handleCreateGroup(
    @ConnectedSocket() client: Socket & { user: { id: number } },
    @MessageBody() data: { name: string; participantIds: number[] },
  ) {
    const userId = client.user.id;

    try {
      // Явное приведение типа для предотвращения ошибок "error typed value"
      const group = (await this.groupService.createGroup(
        userId,
        data.name,
        data.participantIds,
      )) as unknown as FullGroup;

      if (group && group.members) {
        group.members.forEach((member) => {
          // Используем void для игнорирования плавающих промисов в emit
          void this.server
            .to(`user:${member.userId}`)
            .emit(NOTIFICATIONS.groupChatNew, {
              ...group,
              interlocutor: null,
            });
        });
      }

      await client.join(`chat:${group.id}`);

      return { status: 'ok', conversationId: group.id };
    } catch (e: unknown) {
      return {
        status: 'error',
        message: e instanceof Error ? e.message : String(e),
      };
    }
  }

  @SubscribeMessage(REQUESTS.groupChatList)
  async handleGetGroups(
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;

    try {
      // Здесь предполагается, что getUserGroups возвращает массив объектов
      const groups = await this.groupService.getUserGroups(userId);

      for (const group of groups) {
        // Убедитесь, что обращение к .id происходит у типизированного объекта
        if (group && typeof group.id === 'number') {
          await client.join(`chat:${group.id}`);
        }
      }

      return { status: 'ok', data: groups };
    } catch (e: unknown) {
      return {
        status: 'error',
        message: e instanceof Error ? e.message : 'Unknown error',
      };
    }
  }
}
