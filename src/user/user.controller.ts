import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CreateUserDto, UpdateProfileDto } from './dto/user.dto';
import { UserService } from './user.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('/registration')
  async createUser(@Body() dto: CreateUserDto) {
    return this.userService.createUser(dto);
  }

  @Post('/verify-email')
  async verifyEmail(@Body() body: { email: string; code: string }) {
    return this.userService.verifyEmail(body.email, body.code);
  }

  @Post('/resend-verification')
  async resendVerification(@Body() body: { email: string }) {
    return this.userService.resendVerification(body.email);
  }

  @UseGuards(JwtAuthGuard)
  @Get('/me')
  async getProfile(@Req() req: { user: { id: number } }) {
    return this.userService.getProfile(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('/profile')
  async updateProfile(
    @Req() req: { user: { id: number } },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.userService.updateProfile(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('/request-email-change')
  async requestEmailChange(
    @Req() req: { user: { id: number } },
    @Body() body: { newEmail: string },
  ) {
    return this.userService.requestEmailChange(req.user.id, body.newEmail);
  }

  @UseGuards(JwtAuthGuard)
  @Post('/verify-email-change')
  async verifyEmailChange(
    @Req() req: { user: { id: number } },
    @Body() body: { code: string },
  ) {
    return this.userService.verifyEmailChange(req.user.id, body.code);
  }
}
