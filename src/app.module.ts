import { Module } from '@nestjs/common';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { EventsGateway } from './websocket/events.gateway';
import * as path from 'path';

const envFilePath = path.resolve(__dirname, '../.env');

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath,
      isGlobal: true,
    }),
    UserModule,
    AuthModule,
  ],
  providers: [EventsGateway],
})
export class AppModule {}
