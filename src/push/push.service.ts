import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { App, initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getMessaging, MulticastMessage } from 'firebase-admin/messaging';

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private firebaseApp: App | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    try {
      const serviceAccount = this.configService.get<string>(
        'FIREBASE_SERVICE_ACCOUNT',
      );
      const projectId =
        this.configService.get<string>('FIREBASE_PROJECT_ID') ||
        'crafthive-1e22f';

      const fs = require('fs');
      const path = require('path');
      const defaultJsonPath = path.resolve(
        process.cwd(),
        'firebase-adminsdk.json',
      );

      if (serviceAccount) {
        let certObj: ServiceAccount;
        try {
          certObj = JSON.parse(serviceAccount);
        } catch {
          certObj = require(path.resolve(process.cwd(), serviceAccount));
        }

        this.firebaseApp = initializeApp({
          credential: cert(certObj),
        });
        this.logger.log('🔥 Firebase Admin SDK успешно инициализирован');
      } else if (fs.existsSync(defaultJsonPath)) {
        const certObj = require(defaultJsonPath);
        this.firebaseApp = initializeApp({
          credential: cert(certObj),
        });
        this.logger.log(
          '🔥 Firebase Admin SDK успешно инициализирован из firebase-adminsdk.json',
        );
      } else if (projectId) {
        this.firebaseApp = initializeApp({
          projectId,
        });
        this.logger.log(
          `🔥 Firebase Admin SDK инициализирован для проекта: ${projectId}`,
        );
      } else {
        this.logger.warn(
          '⚠️ FIREBASE_SERVICE_ACCOUNT не указан. Push-уведомления будут логироваться в консоль.',
        );
      }
    } catch (err) {
      this.logger.error('Ошибка инициализации Firebase Admin SDK:', err);
    }
  }

  async saveToken(userId: number, token: string, platform: string = 'web') {
    if (!token) return null;
    return this.prisma.deviceToken.upsert({
      where: { token },
      update: { userId, platform, updatedAt: new Date() },
      create: { userId, token, platform },
    });
  }

  async removeToken(token: string) {
    if (!token) return;
    try {
      await this.prisma.deviceToken.delete({ where: { token } });
    } catch {
      // Игнорируем, если токена уже нет в базе
    }
  }

  async sendPushToUser(
    userId: number,
    payload: { title: string; body: string; data?: Record<string, string> },
  ) {
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true },
    });

    if (!tokens.length) return;

    const tokenList = tokens.map((t) => t.token);
    await this.sendToTokens(tokenList, payload);
  }

  async sendPushToUsers(
    userIds: number[],
    payload: { title: string; body: string; data?: Record<string, string> },
  ) {
    if (!userIds.length) return;

    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId: { in: userIds } },
      select: { token: true },
    });

    if (!tokens.length) return;

    const tokenList = tokens.map((t) => t.token);
    await this.sendToTokens(tokenList, payload);
  }

  private async sendToTokens(
    tokens: string[],
    payload: { title: string; body: string; data?: Record<string, string> },
  ) {
    if (!this.firebaseApp) {
      this.logger.log(
        `[FCM MOCK] Push для ${tokens.length} устройств: "${payload.title}" - "${payload.body}"`,
      );
      return;
    }

    try {
      const message: MulticastMessage = {
        tokens,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data || {},
        webpush: {
          fcmOptions: {
            link: payload.data?.url || 'https://crafthive.ru/main',
          },
        },
      };

      const response = await getMessaging(
        this.firebaseApp,
      ).sendEachForMulticast(message);

      // Очистка невалидных токенов
      if (response.failureCount > 0) {
        const invalidTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errCode = resp.error?.code;
            if (
              errCode === 'messaging/invalid-registration-token' ||
              errCode === 'messaging/registration-token-not-registered'
            ) {
              invalidTokens.push(tokens[idx]);
            }
          }
        });

        if (invalidTokens.length > 0) {
          await this.prisma.deviceToken.deleteMany({
            where: { token: { in: invalidTokens } },
          });
          this.logger.log(`Удалено ${invalidTokens.length} устаревших токенов`);
        }
      }
    } catch (e) {
      this.logger.error('Ошибка отправки Push-уведомлений:', e);
    }
  }
}
