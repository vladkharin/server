import { Test, TestingModule } from '@nestjs/testing';
import { PushService } from './push.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('PushService', () => {
  let service: PushService;
  let prismaService: any;
  let configService: any;

  beforeEach(async () => {
    prismaService = {
      deviceToken: {
        upsert: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
      },
    };

    configService = {
      get: jest.fn().mockReturnValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: PrismaService, useValue: prismaService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<PushService>(PushService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('saveToken', () => {
    it('should upsert device token', async () => {
      prismaService.deviceToken.upsert.mockResolvedValue({
        userId: 1,
        token: 'token_123',
        platform: 'web',
      });

      const result = await service.saveToken(1, 'token_123', 'web');
      expect(result).toEqual({ userId: 1, token: 'token_123', platform: 'web' });
      expect(prismaService.deviceToken.upsert).toHaveBeenCalledWith({
        where: { token: 'token_123' },
        update: { userId: 1, platform: 'web', updatedAt: expect.any(Date) },
        create: { userId: 1, token: 'token_123', platform: 'web' },
      });
    });

    it('should return null if token is empty', async () => {
      const result = await service.saveToken(1, '', 'web');
      expect(result).toBeNull();
    });
  });

  describe('removeToken', () => {
    it('should delete token from database', async () => {
      await service.removeToken('token_to_remove');
      expect(prismaService.deviceToken.delete).toHaveBeenCalledWith({
        where: { token: 'token_to_remove' },
      });
    });
  });
});
