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
import { FriendStatus } from '../../generated/prisma/client'; // 👈 Из Prisma!
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
      return { ...result, id: data.id };
    } catch (error: any) {
      return { error: error.message, id: data.id };
    }
  }

  @SubscribeMessage(REQUESTS.friendList)
  async handleFriendsList(
    @MessageBody() data: ListFriendsDto,
    @ConnectedSocket() client: Socket & { user?: { id: number } },
  ) {
    const userId = client.user?.id;
    if (!userId)
      return client.emit(REQUESTS.friendList, {
        error: 'Unauthorized',
        id: data.id,
      });

    try {
      const friends = await this.friendService.getFriends(userId, data.status);
      console.log(friends);
      client.emit(REQUESTS.friendList, { response: friends, id: data.id });
      return;
    } catch (error: any) {
      client.emit(REQUESTS.friendList, { error: error.message, id: data.id });
      return;
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
      client.emit(REQUESTS.friendIncoming, { response: requests, id: data.id });
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
      client.emit(REQUESTS.friendOutgoing, { response: requests, id: data.id });
    } catch (error: any) {
      return { error: error.message, id: data.id };
    }
  }
}
