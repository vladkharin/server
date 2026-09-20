import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';

describe('UserService', () => {
  let service: UserService;
  let prismaService: any;
  let emailService: any;

  beforeEach(async () => {
    prismaService = {
      user: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      friend: {
        findMany: jest.fn(),
      },
      conversation: {
        findMany: jest.fn(),
      },
      socialAccount: {
        create: jest.fn(),
      },
    };

    emailService = {
      sendVerificationCode: jest.fn().mockResolvedValue(true),
      sendEmailChangeCode: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: prismaService },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createUser', () => {
    it('should hash password and create user in prisma and send email code', async () => {
      const dto = {
        name: 'Ivan',
        surname: 'Ivanov',
        username: 'ivan123',
        email: 'ivan@mail.com',
        password: 'plainpassword',
      };
      prismaService.user.findFirst.mockResolvedValue(null);
      prismaService.user.create.mockResolvedValue({ id: 1, ...dto, password: 'hashed' });

      const result = await service.createUser(dto);
      expect(result).toBeDefined();
      expect(prismaService.user.create).toHaveBeenCalled();
      expect(emailService.sendVerificationCode).toHaveBeenCalled();
    });

    it('should throw ConflictException if username is taken', async () => {
      const dto = {
        name: 'Ivan',
        surname: 'Ivanov',
        username: 'ivan123',
        email: 'ivan@mail.com',
        password: 'plainpassword',
      };
      prismaService.user.findFirst.mockResolvedValueOnce({ id: 2, username: 'ivan123' });

      await expect(service.createUser(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('verifyEmail', () => {
    it('should verify email with valid code', async () => {
      prismaService.user.findFirst.mockResolvedValue({
        id: 1,
        email: 'ivan@mail.com',
        isEmailVerified: false,
        emailVerificationCode: '123456',
        emailVerificationExpires: new Date(Date.now() + 60000),
      });
      prismaService.user.update.mockResolvedValue({ id: 1, isEmailVerified: true });

      const result = await service.verifyEmail('ivan@mail.com', '123456');
      expect(result.success).toBe(true);
      expect(prismaService.user.update).toHaveBeenCalled();
    });

    it('should reject invalid code', async () => {
      prismaService.user.findFirst.mockResolvedValue({
        id: 1,
        email: 'ivan@mail.com',
        isEmailVerified: false,
        emailVerificationCode: '123456',
        emailVerificationExpires: new Date(Date.now() + 60000),
      });

      await expect(service.verifyEmail('ivan@mail.com', '999999')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findById and findOne', () => {
    it('should find user by id', async () => {
      prismaService.user.findUnique.mockResolvedValue({ id: 1, username: 'ivan' });
      const user = await service.findById(1);
      expect(user).toEqual({ id: 1, username: 'ivan' });
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('should find user by username', async () => {
      prismaService.user.findFirst.mockResolvedValue({ id: 1, username: 'ivan' });
      const user = await service.findOne('ivan');
      expect(user).toEqual({ id: 1, username: 'ivan' });
      expect(prismaService.user.findFirst).toHaveBeenCalledWith({ where: { username: 'ivan' } });
    });
  });

  describe('getProfile', () => {
    it('should return user profile without password', async () => {
      const mockProfile = {
        id: 1,
        username: 'ivan',
        email: 'ivan@mail.com',
        name: 'Ivan',
        surname: 'Ivanov',
        createdAt: new Date(),
      };
      prismaService.user.findUnique.mockResolvedValue(mockProfile);

      const profile = await service.getProfile(1);
      expect(profile).toEqual(mockProfile);
    });

    it('should throw error if user not found', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);
      await expect(service.getProfile(999)).rejects.toThrow('Пользователь не найден');
    });
  });

  describe('searchUsers', () => {
    it('should return users matching query with relationship status', async () => {
      prismaService.user.findMany.mockResolvedValue([
        { id: 2, username: 'alex' },
        { id: 3, username: 'alice' },
      ]);
      prismaService.friend.findMany.mockResolvedValue([
        { senderId: 1, receiverId: 2, status: 'ACCEPTED' },
      ]);

      const results = await service.searchUsers('al', 1);
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        id: 2,
        username: 'alex',
        hasPendingRequest: false,
        isFriend: true,
        isRequestReceived: false,
      });
      expect(results[1]).toEqual({
        id: 3,
        username: 'alice',
        hasPendingRequest: false,
        isFriend: false,
        isRequestReceived: false,
      });
    });
  });
});
