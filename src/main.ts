import 'dotenv/config';
import * as dns from 'node:dns';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { LogService } from './log/log.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaClientExceptionFilter } from './common/filters/prisma-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const prismaService = app.get(PrismaService);
  const logService = app.get(LogService);

  try {
    // Выполняем простой запрос к БД
    await prismaService.$queryRaw`SELECT 1`;
    console.log('✅ Успешное подключение к PostgreSQL');
  } catch (error) {
    console.error('❌ Ошибка подключения к базе данных:', error);
    process.exit(1); // Завершить приложение, если БД недоступна
  }

  app.useGlobalFilters(
    new AllExceptionsFilter(logService),
    new PrismaClientExceptionFilter(),
  );
  app.enableCors({
    origin: (origin, callback) => {
      // Разрешаем любые запросы с crafthive.ru, localhost или без origin (curl/mobile)
      if (!origin || origin.includes('crafthive.ru') || origin.includes('localhost')) {
        callback(null, true);
      } else {
        callback(null, true); // Разрешаем все origins для надежности
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type, Accept, Authorization, x-requested-with',
  });
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  await app.listen(3001);
}

bootstrap();
