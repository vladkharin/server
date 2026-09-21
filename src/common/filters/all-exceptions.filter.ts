import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LogService } from 'src/log/log.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly logService?: LogService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Если это не HTTP контекст (например, WS или микросервис), пропускаем response
    if (!response || typeof response.status !== 'function') {
      return;
    }

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : (exception as any)?.message || 'Internal server error';

    const stack = (exception as any)?.stack;

    // Логируем в БД только реальные ошибки (>= 500) или необработанные исключения
    if (status >= 500 && this.logService) {
      const user = (request as any)?.user;
      this.logService
        .createClientError({
          source: 'backend_http',
          userId: user?.id ? Number(user.id) : undefined,
          userEmail: user?.email || user?.username,
          message: `[${status}] ${request.method} ${request.url} - ${message}`,
          stack,
          url: request.url,
          context: {
            method: request.method,
            ip: request.headers['x-forwarded-for'] || request.socket.remoteAddress,
            userAgent: request.headers['user-agent'],
            status,
          },
        })
        .catch(() => {});
    }

    this.logger.error(
      `[${status}] ${request.method} ${request.url} - ${message}`,
      stack,
    );

    const errorResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : {
            statusCode: status,
            message: 'Внутренняя ошибка сервера',
            error: 'Internal Server Error',
          };

    response.status(status).json(
      typeof errorResponse === 'object'
        ? errorResponse
        : { statusCode: status, message: errorResponse },
    );
  }
}
