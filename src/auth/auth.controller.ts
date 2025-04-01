import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Get,
  Request,
} from '@nestjs/common';
import { AuthService } from './auth.service';
// import { AuthGuard } from '@nestjs/passport';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  // @UseGuards(AuthGuard('local'))
  @Post('login')
  signIn(@Request() req) {
    return req;
  }

  @Get('profile')
  getProfile(@Request() req) {
    console.log(req);
    return req.user;
  }
}
