import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-yandex';
import { AuthService } from '../auth.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class YandexStrategy extends PassportStrategy(Strategy, 'yandex') {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService, // 1. Внедряем сервис через конструктор
  ) {
    super({
      // 2. Используем внедренный configService (не статический вызов)
      clientID: configService.get<string>('YANDEX_CLIENT_ID') ?? '',
      clientSecret: configService.get<string>('YANDEX_CLIENT_SECRET') ?? '',
      callbackURL: configService.get<string>('YANDEX_CALLBACK_URL') ?? '',
    });
  }

  async validate(
    _accessToken: string, // 3. Добавляем _, если переменная не используется
    _refreshToken: string,
    profile: Profile,
    done: (err: unknown, user: unknown, info?: unknown) => void, // 4. Заменяем any на unknown
  ): Promise<void> {
    try {
      const { id, username, emails } = profile;
      const email = emails?.[0]?.value;

      // 5. Проверка на наличие email (TS ругался на string | undefined)
      if (!email) {
        return done(
          new InternalServerErrorException('Email not provided by Yandex'),
          null,
        );
      }

      const yandexUser = {
        providerId: id,
        username: username || `id${id}`,
        email: email, // Теперь это точно string
      };

      const user = await this.authService.validateOrCreateSocialUser(
        'YANDEX',
        yandexUser,
      );

      done(null, user);
    } catch (_err) {
      // 6. Добавляем _, если ошибка не используется в логах
      done(new InternalServerErrorException('Yandex auth failed'), null);
    }
  }
}
