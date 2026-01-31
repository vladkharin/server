// src/call/call.service.ts
import { Injectable } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { dmService } from 'src/dm/dm.service';
import { WebRtcSignalPayload } from 'src/types/types';

@Injectable()
export class callService {
  constructor(private dmService: dmService) {}

  async handleCallRequest(
    client: Socket,
    payload: { conversationId: number },
    userSockets: Map<number, string>,
    server: Server,
  ) {
    const callerId = client.user?.id;
    if (!callerId)
      return client.emit('call_error', { message: 'Unauthorized' });

    const isMember = await this.dmService.isUserInConversation(
      callerId,
      payload.conversationId,
    );
    if (!isMember)
      return client.emit('call_error', { message: 'Not a member' });

    const participants = await this.dmService.getConversationParticipants(
      payload.conversationId,
    );
    const calleeId = participants.find((id) => id !== callerId);
    if (!calleeId) return;

    const calleeSocketId = userSockets.get(calleeId);
    if (!calleeSocketId)
      return client.emit('call_error', { message: 'User offline' });

    console.log('📞 Caller ID:', callerId);
    console.log('👥 Participants:', participants);
    console.log('🎯 Callee ID:', calleeId);
    console.log('🔌 Callee Socket ID:', calleeSocketId);

    server.to(calleeSocketId).emit('incoming_call', {
      from: callerId,
      conversationId: payload.conversationId,
    });
  }

  handleWebRtcSignal(
    client: Socket,
    payload: WebRtcSignalPayload,
    userSockets: Map<number, string>,
    server: Server,
  ) {
    const senderId = client.user?.id;
    if (!senderId) return;

    const targetSocketId = userSockets.get(payload.targetUserId);
    if (targetSocketId) {
      server.to(targetSocketId).emit('webrtc_signal', {
        from: senderId,
        data: payload.data,
      });
    }
  }

  async handleCallAccept(
    client: Socket,
    payload: { conversationId: number },
    userSockets: Map<number, string>,
    server: Server,
  ) {
    const calleeId = client.user?.id;
    if (!calleeId) return;

    const participants = await this.dmService.getConversationParticipants(
      payload.conversationId,
    );
    const callerId = participants.find((id) => id !== calleeId);
    if (!callerId) return;

    const callerSocketId = userSockets.get(callerId);
    if (callerSocketId) {
      server.to(callerSocketId).emit('call_accepted', { by: calleeId });
    }
  }

  async handleCallEnd(
    client: Socket,
    payload: { conversationId: number },
    userSockets: Map<number, string>,
    server: Server,
  ) {
    const userId = client.user?.id;
    if (!userId) return;

    // Получаем всех участников чата
    const participants = await this.dmService.getConversationParticipants(
      payload.conversationId,
    );

    // Отправляем 'call_ended' всем онлайн-участникам
    for (const participantId of participants) {
      if (participantId === userId) continue; // не отправляем самому себе

      const socketId = userSockets.get(participantId);
      if (socketId) {
        server.to(socketId).emit('call_ended', {
          by: userId,
          conversationId: payload.conversationId,
        });
      }
    }
  }
}
