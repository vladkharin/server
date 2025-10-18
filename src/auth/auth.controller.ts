import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { signInDto } from './dto/auth.dto';

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

    return this.authService.login(user.username, user.id);
  }
}
