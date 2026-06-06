import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
  Get, // 👈 Добавь это
  UseGuards, // 👈 Добавь это
  Req, // 👈 Добавь это
  Res, // 👈 Добавь это
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { signInDto } from './dto/auth.dto';
import { AuthGuard } from '@nestjs/passport'; // 👈 Добавь это
import { Response } from 'express'; // 👈 Добавь это для типизации редиректа

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post('user')
  async signIn(@Body() req: signInDto) {
    const user = await this.authService.validateUser(
      req.username,
      req.password,
    );

    if (!user) {
      throw new UnauthorizedException('Неверные учетные данные');
    }

    return this.authService.login({ username: user.username, id: user.id });
  }

  // --- НОВЫЕ МЕТОДЫ ДЛЯ ЯНДЕКСА ---

  // 1. Этот роут запускает процесс авторизации
  @Get('yandex')
  @UseGuards(AuthGuard('yandex'))
  async yandexAuth() {
    // Здесь пусто, Guard сам перенаправит пользователя в Яндекс
  }

  // 2. Сюда Яндекс вернет пользователя
  @Get('yandex/callback')
  @UseGuards(AuthGuard('yandex'))
  async yandexAuthRedirect(@Req() req: any, @Res() res: Response) {
    // req.user — это пользователь, которого вернула стратегия
    const result = await this.authService.login(req.user);

    // Редиректим на фронтенд (на страницу, которую мы создали ранее)
    // В Next.js это будет страница /auth-success
    const frontendUrl = `http://localhost:3000/auth-success?token=${result.access_token}`;

    return res.redirect(frontendUrl);
  }
}
