import {
  Body,
  Controller,
  Delete,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PushService } from './push.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @UseGuards(JwtAuthGuard)
  @Post('register')
  async registerToken(
    @Req() req: { user: { id: number } },
    @Body() body: { token: string; platform?: string },
  ) {
    return this.pushService.saveToken(req.user.id, body.token, body.platform);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('unregister')
  async unregisterToken(@Body() body: { token: string }) {
    await this.pushService.removeToken(body.token);
    return { status: 'ok' };
  }
}
