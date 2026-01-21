import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/user.dto';
import { genSalt, hash } from 'bcryptjs';
import { User } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(dto: CreateUserDto) {
    const salt = await genSalt(10);
    const hashPassword = await hash(dto.password, salt);
    const data = { ...dto, password: hashPassword };

    return this.prisma.user.create({ data });
  }

  async findOne(username: string) {
    return await this.prisma.user.findFirst({
      where: { username: username },
    });
  }

  async findById(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async getUserChats(userId: number) {
    const PUBLIC_USER_SELECT = {
      id: true,
      name: true,
      surname: true,
      username: true,
    } as const;

    // В методе сервиса
    return this.prisma.conversation.findMany({
      where: {
        members: {
          some: { userId },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: PUBLIC_USER_SELECT,
            },
          },
        },
      },
    });
  }
}
