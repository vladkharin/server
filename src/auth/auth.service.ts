import {
  Injectable,
  InternalServerErrorException, // Убрал UnauthorizedException, так как он не использовался
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../user/user.service';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

interface JwtPayload {
  username: string;
  sub: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * 1. ВАЛИДАЦИЯ ДЛЯ LOCAL STRATEGY
   */
  async validateUser(
    username: string,
    pass: string,
  ): Promise<Omit<User, 'password'> | null> {
    const user = await this.userService.findOne(username);

    if (!user || !user.password) {
      return null;
    }

    const isMatch = await bcrypt.compare(pass, user.password);
    if (isMatch) {
      // Исправлено: добавлено нижнее подчеркивание к password (_password),
      // чтобы ESLint понимал, что переменная намеренно не используется.
      const { password: _password, ...result } = user;
      return result;
    }

    return null;
  }

  /**
   * 2. ГЕНЕРАЦИЯ ТОКЕНА
   * Исправлено: заменено any на конкретный объект с нужными полями
   */
  async login(user: { id: number; username: string }) {
    const payload: JwtPayload = { username: user.username, sub: user.id };
    return {
      id: user.id,
      username: user.username,
      access_token: await this.jwtService.signAsync(payload),
    };
  }

  /**
   * 3. ВАЛИДАЦИЯ ТОКЕНА (Для WebSockets и Guards)
   */
  async validateToken(token: string): Promise<User | null> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      const user = await this.userService.findById(payload.sub);

      if (!user) return null;

      return user;
    } catch (_e) {
      // Исправлено: заменено e на _e (неиспользуемая переменная в catch)
      return null;
    }
  }

  /**
   * 4. ЛОГИКА ДЛЯ СОЦСЕТЕЙ
   */
  async validateOrCreateSocialUser(
    provider: string,
    profile: { providerId: string; email: string; username: string },
  ) {
    try {
      let user = await this.userService.findBySocialId(
        provider,
        profile.providerId,
      );

      if (!user) {
        user = await this.userService.findByEmail(profile.email);

        if (user) {
          await this.userService.linkSocialAccount(
            user.id,
            provider,
            profile.providerId,
          );
        } else {
          user = await this.userService.createSocialUser({
            email: profile.email,
            username: profile.username,
            provider: provider,
            providerId: profile.providerId,
          });
        }
      }

      return user;
    } catch (error) {
      console.error('Social Auth Error:', error);
      throw new InternalServerErrorException(
        'Ошибка при обработке данных соцсети',
      );
    }
  }
}
