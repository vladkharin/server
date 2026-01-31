import { BadRequestException, Injectable } from '@nestjs/common';
import { createDmDto } from './dto/dm.dto';
import { UserService } from 'src/user/user.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { websocketLogger } from 'src/common/logger/websocket.logger';
import { Socket } from 'socket.io';
import { WsException } from '@nestjs/websockets';
import { RequestWithId } from 'src/common/utils/request-with-id.interface';

@Injectable()
export class dmService {
  constructor(
    private prisma: PrismaService,
    private userService: UserService,
  ) {}

  async create(currentUserId: number, dmDto: createDmDto) {
    if (currentUserId == dmDto.participantId) {
      throw new BadRequestException('Cannot create chat with yourself');
    }
    // Проверяем, существует ли пользователь
    const participantExists = await this.userService.findById(
      dmDto.participantId,
    );
    if (!participantExists) {
      throw new BadRequestException('User not found');
    }
    // 3. Генерация dmHash: "minId-maxId"
    const [minId, maxId] =
      currentUserId < dmDto.participantId
        ? [currentUserId, dmDto.participantId]
        : [dmDto.participantId, currentUserId];
    const dmHash = `${minId}-${maxId}`;

    // 4. Создание чата с участниками
    return this.prisma.conversation.upsert({
      where: { dmHash },
      create: {
        type: 'DIRECT',
        dmHash,
        members: {
          create: [{ userId: currentUserId }, { userId: dmDto.participantId }],
        },
      },
      update: {}, // если существует — ничего не меняем
    });
  }

  async socketEventDmCreate(client: Socket, data: createDmDto & RequestWithId) {
    // Валидация через class-validator (если используете ValidationPipe)
    const requestId = data.id; // ← берём ID от клиента

    try {
      websocketLogger.info(
        `📥 [INPUT] id=${requestId} | create.server from ${client.id}: ${JSON.stringify(data)}`,
      );

      if (!client.user) {
        throw new WsException('Unauthorized');
      }

      const server = await this.create(client.user.id, data);

      const response = {
        status: 'ok',
        id: requestId, // ← тот же ID!
        server,
      };

      websocketLogger.info(
        `📤 [OUTPUT] id=${requestId} | create.server to ${client.id}: success`,
      );

      return response;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Даже в ошибке возвращаем ID!
      websocketLogger.error(
        `💥 [ERROR] id=${requestId} | create.server: ${errorMessage}`,
      );

      throw new WsException({
        status: 'error',
        id: requestId, // ← даже в ошибке!
        message: errorMessage,
      });
    }
  }

  async isUserInConversation(
    userId: number,
    conversationId: number,
  ): Promise<boolean> {
    const count = await this.prisma.conversationMember.count({
      where: { userId, conversationId },
    });
    return count > 0;
  }

  // Получение участников
  async getConversationParticipants(conversationId: number): Promise<number[]> {
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    return members.map((m) => m.userId);
  }
}
