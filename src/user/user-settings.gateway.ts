import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from 'src/prisma/prisma.service';
import { NOTIFICATIONS, REQUESTS } from 'src/commands/commands';
import * as crypto from 'crypto';

@WebSocketGateway()
export class UserSettingsGateway {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly prisma: PrismaService) {}

  @SubscribeMessage(REQUESTS.userStatusUpdate)
  async handleStatusUpdate(
    @MessageBody()
    data: {
      customStatus?: string;
      statusEmoji?: string;
      id?: string;
    },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          customStatus: data.customStatus,
          statusEmoji: data.statusEmoji,
        },
        select: {
          id: true,
          username: true,
          customStatus: true,
          statusEmoji: true,
        },
      });

      this.server.emit(NOTIFICATIONS.userStatus, user);

      return {
        status: 'ok',
        response: user,
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error updating status',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.userThemeUpdate)
  async handleThemeUpdate(
    @MessageBody() data: { theme: string; id?: string },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: { theme: data.theme },
        select: { id: true, theme: true },
      });

      return {
        status: 'ok',
        response: user,
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error updating theme',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.user2faGenerate)
  async handle2faGenerate(
    @MessageBody() data: { id?: string },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      const secret = crypto.randomBytes(20).toString('hex').slice(0, 32);
      const user = await this.prisma.user.findUnique({ where: { id: userId } });

      await this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorSecret: secret },
      });

      const otpauthUrl = `otpauth://totp/CraftHive:${user?.username}?secret=${secret}&issuer=CraftHive`;

      return {
        status: 'ok',
        response: {
          secret,
          otpauthUrl,
        },
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error generating 2FA',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.user2faVerify)
  async handle2faVerify(
    @MessageBody() data: { code: string; id?: string },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      // Подтверждаем и активируем 2FA
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: true },
        select: { id: true, twoFactorEnabled: true },
      });

      return {
        status: 'ok',
        response: {
          success: true,
          twoFactorEnabled: user.twoFactorEnabled,
        },
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error verifying 2FA',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.user2faDisable)
  async handle2faDisable(
    @MessageBody() data: { id?: string },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: false, twoFactorSecret: null },
      });

      return {
        status: 'ok',
        response: { success: true },
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error disabling 2FA',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.sessionList)
  async handleSessionList(
    @MessageBody() data: { id?: string },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      const sessions = await this.prisma.userSession.findMany({
        where: { userId },
        orderBy: { lastActive: 'desc' },
      });

      return {
        status: 'ok',
        response: sessions,
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error fetching sessions',
        id: data.id,
      };
    }
  }

  @SubscribeMessage(REQUESTS.sessionTerminate)
  async handleSessionTerminate(
    @MessageBody() data: { sessionId: number; id?: string },
    @ConnectedSocket() client: Socket & { user: { id: number } },
  ) {
    const userId = client.user.id;
    try {
      await this.prisma.userSession.deleteMany({
        where: { id: data.sessionId, userId },
      });

      return {
        status: 'ok',
        response: { success: true },
        id: data.id,
      };
    } catch (error: any) {
      return {
        error: error?.message || 'Error terminating session',
        id: data.id,
      };
    }
  }
}
