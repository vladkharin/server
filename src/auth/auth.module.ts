import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserModule } from 'src/user/user.module';
import { LocalStrategy } from './strategies/local.strategy';
import { YandexStrategy } from './strategies/yandex.strategy'; // 👈 1. Импортируй стратегию
import { JwtModule } from '@nestjs/jwt';
import { ConfigService, ConfigModule } from '@nestjs/config'; // Добавил ConfigModule
import { PassportModule } from '@nestjs/passport'; // 👈 2. Импортируй PassportModule

@Module({
  imports: [
    UserModule,
    PassportModule, // 👈 3. Добавь сюда
    ConfigModule, // Убедись, что ConfigModule доступен
    JwtModule.registerAsync({
      global: true,
      useFactory: (configService: ConfigService) => {
        const jwtSecret = configService.get<string>('JWT_SECRET');
        if (!jwtSecret) {
          throw new Error('JWT_SECRET не задан в переменных окружения!');
        }
        return {
          secret: jwtSecret,
          signOptions: { expiresIn: '30d' },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LocalStrategy,
    YandexStrategy, // 👈 4. ОБЯЗАТЕЛЬНО добавь сюда
  ],
  exports: [AuthService],
})
export class AuthModule {}
