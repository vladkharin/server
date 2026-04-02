import { Module } from '@nestjs/common';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { EventsGateway } from './websocket/events.gateway';
import * as path from 'path';
import { DmModule } from './dm/dm.module';
import { PrismaModule } from './prisma/prisma.module';
import { CallModule } from './call/call.module';
import { FriendModule } from './friend/friend.module';
import { MessageModule } from './message/message.module';
const envFilePath = path.resolve(__dirname, '../.env');

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath,
      isGlobal: true,
    }),
    UserModule,
    AuthModule,
    DmModule,
    PrismaModule,
    CallModule,
    FriendModule,
    MessageModule,
  ],
  providers: [EventsGateway],
})
export class AppModule {}
