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
}
