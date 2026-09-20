import { Test, TestingModule } from '@nestjs/testing';
import { dmService } from './dm.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserService } from '../user/user.service';
import { BadRequestException } from '@nestjs/common';

describe('dmService', () => {
  let service: dmService;
  let prismaService: any;
  let userService: any;

  beforeEach(async () => {
    prismaService = {
      conversation: {
        upsert: jest.fn(),
      },
      conversationMember: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
    };

    userService = {
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        dmService,
        { provide: PrismaService, useValue: prismaService },
        { provide: UserService, useValue: userService },
      ],
    }).compile();

    service = module.get<dmService>(dmService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should throw BadRequestException if creating chat with oneself', async () => {
      await expect(service.create(1, { participantId: 1 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if participant does not exist', async () => {
      userService.findById.mockResolvedValue(null);
      await expect(service.create(1, { participantId: 2 })).rejects.toThrow(
        'User not found',
      );
    });

    it('should upsert conversation with deterministic dmHash', async () => {
      userService.findById.mockResolvedValue({ id: 5, username: 'bob' });
      prismaService.conversation.upsert.mockResolvedValue({
        id: 10,
        type: 'DIRECT',
        dmHash: '2-5',
      });

      const result = await service.create(2, { participantId: 5 });
      expect(result).toEqual({ id: 10, type: 'DIRECT', dmHash: '2-5' });
      expect(prismaService.conversation.upsert).toHaveBeenCalledWith({
        where: { dmHash: '2-5' },
        create: {
          type: 'DIRECT',
          dmHash: '2-5',
          members: {
            create: [{ userId: 2 }, { userId: 5 }],
          },
        },
        update: {},
      });
    });
  });

  describe('isUserInConversation', () => {
    it('should return true if user is member of conversation', async () => {
      prismaService.conversationMember.count.mockResolvedValue(1);
      const isMember = await service.isUserInConversation(1, 10);
      expect(isMember).toBe(true);
      expect(prismaService.conversationMember.count).toHaveBeenCalledWith({
        where: { userId: 1, conversationId: 10 },
      });
    });

    it('should return false if user is not member of conversation', async () => {
      prismaService.conversationMember.count.mockResolvedValue(0);
      const isMember = await service.isUserInConversation(1, 10);
      expect(isMember).toBe(false);
    });
  });

  describe('getConversationParticipants', () => {
    it('should return array of participant IDs', async () => {
      prismaService.conversationMember.findMany.mockResolvedValue([
        { userId: 1 },
        { userId: 2 },
      ]);
      const participants = await service.getConversationParticipants(10);
      expect(participants).toEqual([1, 2]);
    });
  });
});
