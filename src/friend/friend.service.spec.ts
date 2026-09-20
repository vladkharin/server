import { Test, TestingModule } from '@nestjs/testing';
import { FriendService } from './friend.service';
import { PrismaService } from '../prisma/prisma.service';
import { FriendStatus } from '@prisma/client';

describe('FriendService', () => {
  let service: FriendService;
  let prismaService: any;

  beforeEach(async () => {
    prismaService = {
      friend: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FriendService,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<FriendService>(FriendService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendRequest', () => {
    it('should throw error when adding oneself as friend', async () => {
      await expect(service.sendRequest(1, 1)).rejects.toThrow('Нельзя добавить себя в друзья');
    });

    it('should return existing status if friendship already exists', async () => {
      prismaService.friend.findFirst.mockResolvedValue({
        id: 1,
        senderId: 1,
        receiverId: 2,
        status: FriendStatus.PENDING,
        receiver: { id: 2, username: 'bob' },
        sender: { id: 1, username: 'alice' },
      });

      const result = await service.sendRequest(1, 2);
      expect(result.exists).toBe(true);
      expect(result.user.hasPendingRequest).toBe(true);
    });

    it('should create new friend request when none exists', async () => {
      prismaService.friend.findFirst.mockResolvedValue(null);
      prismaService.friend.create.mockResolvedValue({
        id: 1,
        senderId: 1,
        receiverId: 2,
        status: FriendStatus.PENDING,
        receiver: { id: 2, username: 'bob' },
      });

      const result = await service.sendRequest(1, 2);
      expect(result.success).toBe(true);
      expect(result.user.id).toBe(2);
      expect(result.user.hasPendingRequest).toBe(true);
    });
  });

  describe('respondToRequest', () => {
    it('should accept friend request and return updated friendship', async () => {
      prismaService.friend.findUnique.mockResolvedValue({
        id: 10,
        senderId: 2,
        receiverId: 1,
      });
      prismaService.friend.update.mockResolvedValue({
        id: 10,
        senderId: 2,
        receiverId: 1,
        status: FriendStatus.ACCEPTED,
        createdAt: new Date(),
        sender: { id: 2, username: 'bob' },
        receiver: { id: 1, username: 'alice' },
      });

      const result = await service.respondToRequest(1, 2, true);
      expect(result.success).toBe(true);
      expect(result.action).toBe('accepted');
      expect(result.friend?.username).toBe('bob');
    });

    it('should decline and delete friend request', async () => {
      prismaService.friend.findUnique.mockResolvedValue({
        id: 10,
        senderId: 2,
        receiverId: 1,
      });
      prismaService.friend.delete.mockResolvedValue({ id: 10 });

      const result = await service.respondToRequest(1, 2, false);
      expect(result.success).toBe(true);
      expect(result.action).toBe('declined');
      expect(prismaService.friend.delete).toHaveBeenCalledWith({ where: { id: 10 } });
    });
  });

  describe('removeFriend', () => {
    it('should delete friendship relationship', async () => {
      prismaService.friend.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.removeFriend(1, 2);
      expect(result).toEqual({ success: true });
      expect(prismaService.friend.deleteMany).toHaveBeenCalled();
    });
  });
});
