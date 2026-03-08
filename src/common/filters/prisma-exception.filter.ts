// src/common/filters/prisma-exception.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '../../../generated/prisma/client';

// Теперь используем Prisma.PrismaClientKnownRequestError
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaClientExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaClientExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    this.logger.error(`Prisma error: ${exception.message}`, exception.stack);

    const fields = (exception.meta?.target as string[]) || ['field'];
    const field = fields[0];

    switch (exception.code) {
      case 'P2002': // Unique constraint failed
        return response.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message: `Пользователь с таким ${field} уже существует`,
          error: 'Conflict',
        });

      case 'P2025': // Record not found
        return response.status(HttpStatus.NOT_FOUND).json({
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Запись не найдена',
          error: 'Not Found',
        });

      case 'P2003': // Foreign key constraint failed
        return response.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Нарушение ссылочной целостности',
          error: 'Bad Request',
        });

      default:
        return response.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Ошибка базы данных',
          error: 'Bad Request',
        });
    }
  }
}
