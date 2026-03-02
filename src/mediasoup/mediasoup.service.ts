// src/mediasoup/mediasoup.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import * as mediasoup from 'mediasoup';

@Injectable()
export class MediasoupService implements OnModuleInit {
  private worker!: mediasoup.Worker;
  private router!: mediasoup.Router;

  async onModuleInit() {
    // ✅ Один вызов с полными настройками
    this.worker = await mediasoup.createWorker({
      logLevel: 'debug',
      logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
      rtcMinPort: 40000,
      rtcMaxPort: 49999,
    });

    console.log('✅ Mediasoup worker created');

    this.worker.on('died', () => {
      console.error('Mediasoup worker died!');
      process.exit(1);
    });

    this.router = await this.worker.createRouter({
      mediaCodecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
        },
      ],
    });

    console.log('✅ Mediasoup router created');
  }

  getRouterRtpCapabilities() {
    return this.router.rtpCapabilities;
  }

  async createWebRtcTransport(
    direction: 'send' | 'recv',
  ): Promise<mediasoup.WebRtcTransport> {
    return this.router.createWebRtcTransport({
      listenIps: [{ ip: '0.0.0.0', announcedIp: '127.0.0.1' }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      appData: {},
    });
  }
}

export type RtpCapabilities = ReturnType<
  MediasoupService['getRouterRtpCapabilities']
>;
