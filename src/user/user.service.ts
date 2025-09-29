import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateUserDto } from './dto/user.dto';
import { genSalt, hash } from 'bcrypt';
import { Prisma } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(dto: CreateUserDto) {
    const salt = await genSalt(10);
    const hashPassword = await hash(dto.password, salt);

    const data = { ...dto, password: hashPassword };

    try {
      return this.prisma.user.create({ data: data });
    } catch (error) {
      console.log(error);
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Обработка ошибки дублирования (уникальное поле: email, username и т.д.)
        // Код P2002 — нарушение уникального ограничения
        if (error.code === 'P2002') {
          const target = (error.meta?.target as string[])?.[0];
          throw new ConflictException(
            `Пользователь с таким ${target} уже существует`,
          );
        }

        // Любая другая ошибка БД или сервера
      }
      console.error('Ошибка при создании пользователя:', error);
      throw new BadRequestException('Не удалось создать пользователя');
    }
  }

  async findOne(username: string) {
    return await this.prisma.user.findFirst({
      where: { username: username },
    });
  }
}
