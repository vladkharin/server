// prisma.config.ts
import { config } from 'dotenv';
import { resolve } from 'node:path';
import type { PrismaConfig } from 'prisma';

// Загружаем переменные из .env (лежит в корне server/)
config({ path: resolve(__dirname, '.env') });

export default {
  schema: resolve(__dirname, 'prisma'), // указываем ПАПКУ с .prisma-файлами
} satisfies PrismaConfig;
