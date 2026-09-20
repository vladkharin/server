import { Test, TestingModule } from '@nestjs/testing';
import { CallService } from './call.service';
import { PrismaService } from '../prisma/prisma.service';
import { MediasoupService } from '../mediasoup/mediasoup.service';

describe('CallService', () => {
  let service: CallService;
  let prismaService: any;
  let mediasoupService: any;

  beforeEach(async () => {
    prismaService = {
      conversation: {
        update: jest.fn(),
      },
      conversationMember: {
        findMany: jest.fn(),
      },
    };

    mediasoupService = {
      createRouter: jest.fn().mockResolvedValue({
        rtpCapabilities: { codecs: [] },
        close: jest.fn(),
      }),
      createWebRtcTransport: jest.fn().mockResolvedValue({
        id: 'transport-1',
        iceParameters: { role: 'controlled' },
        iceCandidates: [],
        dtlsParameters: {},
        connect: jest.fn(),
        produce: jest.fn().mockResolvedValue({ id: 'producer-1', kind: 'audio' }),
        close: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CallService,
        { provide: PrismaService, useValue: prismaService },
        { provide: MediasoupService, useValue: mediasoupService },
      ],
    }).compile();

    service = module.get<CallService>(CallService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOrCreateRoom', () => {
    it('should create new room with mediasoup router when room does not exist', async () => {
      const room = await service.getOrCreateRoom(1);
      expect(room).toBeDefined();
      expect(room.conversationId).toBe(1);
      expect(mediasoupService.createRouter).toHaveBeenCalled();
      expect(prismaService.conversation.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({ callActive: true }),
      });
    });

    it('should return existing room if already created', async () => {
      const room1 = await service.getOrCreateRoom(2);
      const room2 = await service.getOrCreateRoom(2);
      expect(room1).toBe(room2);
    });

    it('should throw error for invalid conversationId', async () => {
      await expect(service.getOrCreateRoom(0)).rejects.toThrow();
    });
  });

  describe('createTransport', () => {
    it('should create WebRTC transport for user', async () => {
      const transportData = await service.createTransport(1, 10);
      expect(transportData).toBeDefined();
      expect(transportData.id).toBe('transport-1');
      expect(mediasoupService.createWebRtcTransport).toHaveBeenCalled();
    });
  });
});
