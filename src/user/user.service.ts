import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateUserDto } from './dto/user.dto';
import { genSalt, hash } from 'bcrypt';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(dto: CreateUserDto) {
    const salt = await genSalt(10);
    const hashPassword = await hash(dto.password, salt);

    const data = { ...dto, password: hashPassword };
    return this.prisma.user.create({ data: data });
  }

  async findOne(email: string) {
    return await this.prisma.user.findUnique({ where: { email: email } });
  }
}
