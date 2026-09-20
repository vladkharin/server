import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from './email.service';
import { ConfigService } from '@nestjs/config';

describe('EmailService', () => {
  let service: EmailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'SMTP_HOST') return null;
              if (key === 'SMTP_PORT') return 587;
              if (key === 'SMTP_FROM') return 'no-reply@crafthive.ru';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should send verification code (in simulated fallback mode)', async () => {
    const result = await service.sendVerificationCode(
      'test@example.com',
      'testuser',
      '123456',
    );
    expect(result).toBe(true);
  });

  it('should send email change code (in simulated fallback mode)', async () => {
    const result = await service.sendEmailChangeCode(
      'new@example.com',
      'testuser',
      '654321',
    );
    expect(result).toBe(true);
  });
});
