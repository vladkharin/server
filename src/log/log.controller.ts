import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { LogService } from './log.service';
import { CreateClientLogDto } from './dto/create-client-log.dto';

@Controller('logs')
export class LogController {
  constructor(private readonly logService: LogService) {}

  @Post('client-error')
  async logClientError(@Body() dto: CreateClientLogDto, @Req() req: any) {
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const enrichedDto: CreateClientLogDto = {
      ...dto,
      context: {
        ...(typeof dto.context === 'object' ? dto.context : { rawContext: dto.context }),
        ip,
        userAgent,
      },
    };

    return await this.logService.createClientError(enrichedDto);
  }

  @Get('client-errors')
  async getRecentLogs(
    @Query('limit') limit?: string,
    @Query('source') source?: string,
  ) {
    const take = limit ? Math.min(Number(limit), 100) : 50;
    return await this.logService.getRecentLogs(take, source);
  }
}
