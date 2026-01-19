import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

interface JwtPayload {
  username: string;
  sub: number; // ← убедитесь, что это совпадает с типом id в вашей БД
}

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
  ) {}

  async validateUser(
    username: string,
    password: string,
  ): Promise<Omit<User, 'password'> | undefined> {
    const user = await this.userService.findOne(username);

    console.log(user);
    console.log(username, password);

    if (!user || !user.password) return undefined;

    const isMatch: boolean = await bcrypt.compare(password, user.password);

    if (!isMatch) return undefined;

    const { password: _, ...result } = user; // исключаем password

    return result;
  }

  // Генерация JWT — отдельный метод
  async login(username: string, id: number) {
    const payload = { username: username, sub: id };

    return {
      id: id,
      access_token: await this.jwtService.signAsync(payload),
    };
  }

  async validateToken(token: string): Promise<Omit<User, 'password'>> {
    if (!process.env.JWT_SECRET) {
      throw new UnauthorizedException('JWT secret is not configured');
    }

    let payload: JwtPayload;
    try {
      // 🔹 3. Явно типизируем результат verifyAsync
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    // 🔹 4. Получаем пользователя
    const user = await this.userService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // 🔹 5. Безопасная деструктуризация (user точно не null)
    const { password: _, ...result } = user;
    return result;
  }
}
