import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { PrismaClientExceptionFilter } from './common/filters/prisma-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const prismaService = app.get(PrismaService);

  try {
    // Выполняем простой запрос к БД
    await prismaService.$queryRaw`SELECT 1`;
    console.log('✅ Успешное подключение к PostgreSQL');
  } catch (error) {
    console.error('❌ Ошибка подключения к базе данных:', error);
    process.exit(1); // Завершить приложение, если БД недоступна
  }

  app.useGlobalFilters(new PrismaClientExceptionFilter());
  app.enableCors();
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  await app.listen(3001);
}

bootstrap();
