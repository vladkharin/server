import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: Partial<Record<keyof AuthService, jest.Mock>>;

  beforeEach(async () => {
    authService = {
      validateUser: jest.fn(),
      login: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('signIn', () => {
    it('should authenticate user and return login response', async () => {
      const mockUser = { id: 1, username: 'vlad' };
      (authService.validateUser as jest.Mock).mockResolvedValue(mockUser);
      (authService.login as jest.Mock).mockResolvedValue({
        id: 1,
        username: 'vlad',
        access_token: 'mock_token',
      });

      const result = await controller.signIn({ username: 'vlad', password: 'password123' });
      expect(result).toEqual({
        id: 1,
        username: 'vlad',
        access_token: 'mock_token',
      });
      expect(authService.validateUser).toHaveBeenCalledWith('vlad', 'password123');
      expect(authService.login).toHaveBeenCalledWith({ username: 'vlad', id: 1 });
    });

    it('should throw UnauthorizedException when credentials are invalid', async () => {
      (authService.validateUser as jest.Mock).mockResolvedValue(null);

      await expect(
        controller.signIn({ username: 'vlad', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
