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

function generateBase32Secret(length = 20): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const randomBytes = crypto.randomBytes(length);
  let secret = '';
  for (let i = 0; i < length; i++) {
    secret += chars[randomBytes[i] % 32];
  }
  return secret;
}

function verifyTOTP(secret: string, code: string, window = 1): boolean {
  if (!secret || !code) return false;
  const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (let i = 0; i < secret.length; i++) {
    const val = base32chars.indexOf(secret.charAt(i).toUpperCase());
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const keyBytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    keyBytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  const key = Buffer.from(keyBytes);

  const epoch = Math.floor(Date.now() / 1000);
  const currentStep = Math.floor(epoch / 30);

  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    const step = currentStep + errorWindow;
    const buf = Buffer.alloc(8);
    buf.writeBigInt64BE(BigInt(step));

    const hmac = crypto.createHmac('sha1', key).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const otp = (binary % 1000000).toString().padStart(6, '0');
    if (otp === code.trim()) {
      return true;
    }
  }
  return false;
}

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
      const secret = generateBase32Secret(20);
      const user = await this.prisma.user.findUnique({ where: { id: userId } });

      await this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorSecret: secret },
      });

      const label = encodeURIComponent(`CraftHive (${user?.username || 'user'})`);
      const issuer = encodeURIComponent('CraftHive');
      const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`;

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
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user || !user.twoFactorSecret) {
        return {
          error: '2FA не была инициирована. Сначала сгенерируйте секретный ключ.',
          id: data.id,
        };
      }

      const isValid = verifyTOTP(user.twoFactorSecret, data.code);
      if (!isValid) {
        return {
          error: 'Неверный 6-значный код 2FA. Проверьте время на устройстве и попробуйте снова.',
          id: data.id,
        };
      }

      // Подтверждаем и активируем 2FA
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: true },
        select: { id: true, twoFactorEnabled: true },
      });

      return {
        status: 'ok',
        response: {
          success: true,
          twoFactorEnabled: updatedUser.twoFactorEnabled,
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
