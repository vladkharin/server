import { Injectable } from '@nestjs/common';

@Injectable()
export class PresenceService {
  // Map<userId, socketId>
  private readonly userSockets = new Map<number, string>();

  set(userId: number, socketId: string) {
    this.userSockets.set(userId, socketId);
  }

  remove(userId: number) {
    this.userSockets.delete(userId);
  }

  getSocketId(userId: number): string | undefined {
    return this.userSockets.get(userId);
  }

  getAll(): Map<number, string> {
    return this.userSockets;
  }
}
