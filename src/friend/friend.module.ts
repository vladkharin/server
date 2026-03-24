// src/friend/friend.module.ts
import { Module } from '@nestjs/common';
import { FriendService } from './friend.service';
import { FriendGateway } from './friend.gateway'; // Опционально
import { PrismaModule } from '../prisma/prisma.module'; // Ваш Prisma модуль

@Module({
  imports: [PrismaModule],
  providers: [FriendService, FriendGateway],
  exports: [FriendService], // 👈 Экспортируем, чтобы использовать в других сервисах
})
export class FriendModule {}
