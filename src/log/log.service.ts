import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateClientLogDto } from './dto/create-client-log.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class LogService {
  private readonly logger = new Logger(LogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createClientError(dto: CreateClientLogDto) {
    try {
      this.logger.warn(
        `🚨 [Client Error] [${dto.source}] User: ${dto.userId || 'Guest'} (${dto.userEmail || 'no-email'}) - ${dto.message}`,
      );

      const logId = randomUUID();
      const log = await (this.prisma as any).clientErrorLog.create({
        data: {
          id: logId,
          userId: dto.userId ? Number(dto.userId) : null,
          userEmail: dto.userEmail || null,
          source: dto.source || 'unknown',
          message: dto.message?.slice(0, 1000) || 'No message',
          stack: dto.stack?.slice(0, 5000) || null,
          context: dto.context ? dto.context : null,
          url: dto.url?.slice(0, 500) || null,
        },
      });

      return { success: true, id: log?.id || logId };
    } catch (err) {
      this.logger.error('Failed to save client error log:', err);
      return { success: false };
    }
  }

  async getRecentLogs(limit = 50, source?: string) {
    return await (this.prisma as any).clientErrorLog.findMany({
      where: source ? { source } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
