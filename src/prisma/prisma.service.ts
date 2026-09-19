// src/prisma/prisma.service.ts
/* eslint-disable */
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super();
  }

  async onModuleInit() {
    try {
      await this.$connect();
    } catch (err) {
      // ✅ Безопасная обработка unknown
      let message = 'Unknown error during Prisma connection';
      if (err instanceof Error) {
        message = err.message;
      } else if (typeof err === 'string') {
        message = err;
      } else {
        message = JSON.stringify(err);
      }
      console.error('Prisma connection error:', message);
      throw new Error(message); // или просто re-throw: throw err;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
