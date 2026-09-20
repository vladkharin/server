import { Test, TestingModule } from '@nestjs/testing';
import { GroupChatService } from './groupChat.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException } from '@nestjs/common';

describe('GroupChatService', () => {
  let service: GroupChatService;
  let prismaService: any;

  beforeEach(async () => {
    prismaService = {
      conversation: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      conversationMember: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      message: {
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupChatService,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<GroupChatService>(GroupChatService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createGroup', () => {
    it('should create group with owner and participants', async () => {
      prismaService.conversation.create.mockResolvedValue({
        id: 1,
        type: 'GROUP',
        name: 'Cool Team',
        ownerId: 1,
        members: [{ userId: 1, isOwner: true }, { userId: 2, isOwner: false }],
      });

      const result = await service.createGroup(1, 'Cool Team', [2]);
      expect(result.id).toBe(1);
      expect(result.name).toBe('Cool Team');
      expect(prismaService.conversation.create).toHaveBeenCalled();
    });
  });

  describe('saveMessage', () => {
    it('should save message if user is member', async () => {
      prismaService.conversationMember.findUnique.mockResolvedValue({
        userId: 1,
        conversationId: 5,
      });
      prismaService.message.create.mockResolvedValue({
        id: 100,
        content: 'Hello team',
        senderId: 1,
        conversationId: 5,
        sender: { id: 1, username: 'boss' },
      });

      const msg = await service.saveMessage(1, 5, 'Hello team');
      expect(msg.content).toBe('Hello team');
      expect(prismaService.message.create).toHaveBeenCalledWith({
        data: {
          content: 'Hello team',
          senderId: 1,
          conversationId: 5,
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              name: true,
              surname: true,
            },
          },
        },
      });
    });

    it('should throw ForbiddenException if user is not a member', async () => {
      prismaService.conversationMember.findUnique.mockResolvedValue(null);

      await expect(service.saveMessage(99, 5, 'Unauthorized message')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
