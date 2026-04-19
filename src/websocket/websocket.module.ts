import { Module, Global } from '@nestjs/common';
import { PresenceService } from './presence.service';
import { EventsGateway } from './events.gateway';
import { AuthModule } from 'src/auth/auth.module';
import { DmModule } from 'src/dm/dm.module';
import { CallModule } from 'src/call/call.module';
import { UserModule } from 'src/user/user.module';
import { PrismaModule } from 'src/prisma/prisma.module';

@Global() // Делаем модуль глобальным, чтобы PresenceService был виден везде без лишних импортов
@Module({
  imports: [
    AuthModule, // Чтобы работал AuthService
    DmModule, // Чтобы работал dmService
    CallModule, // Чтобы работал CallService
    UserModule, // Чтобы работал UserService
    PrismaModule, // Чтобы работал PrismaService
  ],
  providers: [PresenceService, EventsGateway],
  exports: [PresenceService], // Экспортируем, чтобы CallGateway мог его заинжектить
})
export class WebsocketModule {}
