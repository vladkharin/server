import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MessageGateway } from './message.gateway';
import { MessageService } from './message.service';
import { PushModule } from '../push/push.module';

@Module({
  imports: [PrismaModule, PushModule],
  providers: [MessageGateway, MessageService],
  exports: [MessageService],
})
export class MessageModule {}
