import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'; // Проверь путь к PrismaService
import { GroupChatService } from './groupChat.service';
import { GroupGateway } from './groupChat.gateway';

@Module({
  providers: [GroupChatService, GroupGateway, PrismaService],
  exports: [GroupChatService],
})
export class GroupChatModule {}
