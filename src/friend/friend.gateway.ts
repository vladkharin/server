// src/friend/friend.gateway.ts
import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
} from '@nestjs/websockets';
import { Socket, Server } from 'socket.io';
import { FriendService } from './friend.service';
import { FriendStatus } from '@prisma/client'; // 👈 Из Prisma!
import { NOTIFICATIONS, REQUESTS } from 'src/commands/commands';

export interface FriendRequestDto {
  targetId: number;
  id: string;
}

export interface RespondToFriendDto {
  senderId: number;
  accept: boolean;
  id: string;
}

export interface ListFriendsDto {
  status?: FriendStatus;
  id: string;
}

@WebSocketGateway()
export class FriendGateway {
  @WebSocketServer()
  server!: Server;
  constructor(private friendService: FriendService) {}

  @SubscribeMessage(REQUESTS.friendRequest)
  async handleFriendRequest(
    @MessageBody() data: FriendRequestDto,
    @ConnectedSocket() client: Socket & { user?: { id: number } },
  ) {
    const senderId = client.user?.id;
    if (!senderId) return { error: 'Unauthorized', id: data.id };

    try {
      const result = await this.friendService.sendRequest(
        senderId,
        data.targetId,
      );

      if ('friendship' in result && result?.friendship?.status === 'PENDING') {
        this.server
          .to(`user:${data.targetId}`)
          .emit(NOTIFICATIONS.friendRequestReceived, {
            from: {
              id: senderId,
              username: result.friendship.sender.username, // или возьмите из сервиса
            },
            friendshipId: result.friendship.id,
            createdAt: result.friendship.createdAt,
          });
      }
      return { ...result, id: data.id };
    } catch (error: any) {
      return { error: error.message, id: data.id };
    }
  }

  @SubscribeMessage(REQUESTS.friendRespond)
  async handleFriendRespond(
    @MessageBody() data: RespondToFriendDto,
    @ConnectedSocket() client: Socket & { user?: { id: number } },
  ) {
    const userId = client.user?.id;
    if (!userId) return { error: 'Unauthorized', id: data.id };

    try {
      const result = await this.friendService.respondToRequest(
        userId,
        data.senderId,
        data.accept,
      );

      if (result.action == 'accepted') {
        this.server
          .to(`user:${data.senderId}`)
          .emit(NOTIFICATIONS.friendRequestResponded, { response: result });

        return { response: result, id: data.id };
      } else {
        this.server
          .to(`user:${data.senderId}`)
          .emit(NOTIFICATIONS.friendRequestResponded, { response: result });
      }
    } catch (error: any) {
      return {
        error: error?.message,
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.friendList)
  async handleFriendsList(
    @MessageBody() data: ListFriendsDto,
    @ConnectedSocket() client: Socket & { user?: { id: number } },
  ) {
    const userId = client.user?.id;
    if (!userId)
      return {
        error: 'Unauthorized',
        id: data.id,
      };

    try {
      const friends = await this.friendService.getFriends(userId, data.status);
      console.log(friends);
      return { response: friends, id: data.id };
    } catch (error: any) {
      return { error: error.message, id: data.id };
    }
  }

  @SubscribeMessage(REQUESTS.friendIncoming)
  async handleFriendsIncoming(
    @MessageBody() data: { id: string },
    @ConnectedSocket() client: Socket & { user?: { id: number } },
  ) {
    const userId = client.user?.id;
    if (!userId) return { error: 'Unauthorized', id: data.id };

    try {
      const requests = await this.friendService.getIncomingRequests(userId);
      return { response: requests, id: data.id };
    } catch (error: any) {
      return { error: error.message, id: data.id };
    }
  }

  @SubscribeMessage(REQUESTS.friendOutgoing)
  async handleFriendsOutgoing(
    @MessageBody() data: { id: string },
    @ConnectedSocket() client: Socket & { user?: { id: number } },
  ) {
    const userId = client.user?.id;
    if (!userId) return { error: 'Unauthorized', id: data.id };

    try {
      const requests = await this.friendService.getOutgoingRequests(userId);
      // 👇 Отправляем ответ на то же событие
      return { response: requests, id: data.id };
    } catch (error: any) {
      return { error: error.message, id: data.id };
    }
  }
}
