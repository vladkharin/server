import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from 'src/user/user.service';

interface JwtPayload {
  username: string;
  sub: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers['authorization'] as string | undefined;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Отсутствует токен авторизации');
    }

    const token = authHeader.split(' ')[1];
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      const user = await this.userService.findById(payload.sub);

      if (!user) {
        throw new UnauthorizedException('Пользователь не найден');
      }

      req.user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Недействительный токен');
    }
  }
}
