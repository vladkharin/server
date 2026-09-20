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

  isOnline(userId: number): boolean {
    return this.userSockets.has(userId);
  }

  getOnlineUserIds(): number[] {
    return Array.from(this.userSockets.keys());
  }

  getAll(): Map<number, string> {
    return this.userSockets;
  }
}
