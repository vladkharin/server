import { Module } from '@nestjs/common';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import * as path from 'path';
import { DmModule } from './dm/dm.module';
import { PrismaModule } from './prisma/prisma.module';
import { CallModule } from './call/call.module';
import { FriendModule } from './friend/friend.module';
import { MessageModule } from './message/message.module';
import { WebsocketModule } from './websocket/websocket.module';
import { GroupChatModule } from './groupChat/groupChat.module';
import { PushModule } from './push/push.module';
import { UploadModule } from './upload/upload.module';
import { ServerCommunityModule } from './server-community/server-community.module';
import { EmailModule } from './email/email.module';
const envFilePath = path.resolve(__dirname, '../.env');

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath,
      isGlobal: true,
    }),
    EmailModule,
    UserModule,
    AuthModule,
    DmModule,
    PrismaModule,
    CallModule,
    FriendModule,
    MessageModule,
    WebsocketModule,
    GroupChatModule,
    PushModule,
    UploadModule,
    ServerCommunityModule,
  ],
})
export class AppModule {}
