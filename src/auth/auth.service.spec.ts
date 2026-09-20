import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let service: AuthService;
  let userService: Partial<Record<keyof UserService, jest.Mock>>;
  let jwtService: Partial<Record<keyof JwtService, jest.Mock>>;

  beforeEach(async () => {
    userService = {
      findOne: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findBySocialId: jest.fn(),
      createSocialUser: jest.fn(),
      linkSocialAccount: jest.fn(),
    };

    jwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: userService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateUser', () => {
    it('should return user without password when credentials match', async () => {
      const hashedPassword = await bcrypt.hash('secret123', 10);
      const mockUser = {
        id: 1,
        username: 'testuser',
        password: hashedPassword,
        email: 'test@mail.com',
      };

      (userService.findOne as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.validateUser('testuser', 'secret123');
      expect(result).toBeDefined();
      expect(result?.username).toBe('testuser');
      expect((result as any)?.password).toBeUndefined();
    });

    it('should return null if user is not found', async () => {
      (userService.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.validateUser('nonexistent', 'pass');
      expect(result).toBeNull();
    });

    it('should return null if password is incorrect', async () => {
      const hashedPassword = await bcrypt.hash('secret123', 10);
      (userService.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        username: 'testuser',
        password: hashedPassword,
      });

      const result = await service.validateUser('testuser', 'wrongpass');
      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    it('should generate JWT token and return user details', async () => {
      (jwtService.signAsync as jest.Mock).mockResolvedValue('mock_jwt_token');

      const result = await service.login({ id: 1, username: 'testuser' });
      expect(result).toEqual({
        id: 1,
        username: 'testuser',
        access_token: 'mock_jwt_token',
      });
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        username: 'testuser',
        sub: 1,
      });
    });
  });

  describe('validateToken', () => {
    it('should return user if token is valid', async () => {
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
        username: 'testuser',
        sub: 1,
      });
      (userService.findById as jest.Mock).mockResolvedValue({
        id: 1,
        username: 'testuser',
      });

      const result = await service.validateToken('valid_token');
      expect(result).toEqual({ id: 1, username: 'testuser' });
    });

    it('should return null if token verification fails', async () => {
      (jwtService.verifyAsync as jest.Mock).mockRejectedValue(new Error('Invalid token'));

      const result = await service.validateToken('invalid_token');
      expect(result).toBeNull();
    });
  });

  describe('validateOrCreateSocialUser', () => {
    it('should return existing user if social account is found', async () => {
      const mockSocialUser = { id: 2, username: 'yandex_user', email: 'yandex@mail.com' };
      (userService.findBySocialId as jest.Mock).mockResolvedValue(mockSocialUser);

      const result = await service.validateOrCreateSocialUser('YANDEX', {
        providerId: 'yandex-123',
        email: 'yandex@mail.com',
        username: 'yandex_user',
      });

      expect(result).toEqual(mockSocialUser);
    });

    it('should link social account if user exists by email', async () => {
      (userService.findBySocialId as jest.Mock).mockResolvedValue(null);
      const existingUser = { id: 3, username: 'existing', email: 'same@mail.com' };
      (userService.findByEmail as jest.Mock).mockResolvedValue(existingUser);
      (userService.linkSocialAccount as jest.Mock).mockResolvedValue(true);

      const result = await service.validateOrCreateSocialUser('YANDEX', {
        providerId: 'yandex-456',
        email: 'same@mail.com',
        username: 'existing',
      });

      expect(userService.linkSocialAccount).toHaveBeenCalledWith(3, 'YANDEX', 'yandex-456');
      expect(result).toEqual(existingUser);
    });

    it('should create new social user if not found by socialId or email', async () => {
      (userService.findBySocialId as jest.Mock).mockResolvedValue(null);
      (userService.findByEmail as jest.Mock).mockResolvedValue(null);
      const newUser = { id: 4, username: 'new_social', email: 'new@mail.com' };
      (userService.createSocialUser as jest.Mock).mockResolvedValue(newUser);

      const result = await service.validateOrCreateSocialUser('YANDEX', {
        providerId: 'yandex-789',
        email: 'new@mail.com',
        username: 'new_social',
      });

      expect(userService.createSocialUser).toHaveBeenCalledWith({
        provider: 'YANDEX',
        providerId: 'yandex-789',
        email: 'new@mail.com',
        username: 'new_social',
      });
      expect(result).toEqual(newUser);
    });
  });
});
