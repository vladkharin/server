// src/mediasoup/mediasoup.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import * as mediasoup from 'mediasoup';

const PUBLIC_IP = process.env.PUBLIC_IP;

@Injectable()
export class MediasoupService implements OnModuleInit {
  private worker!: mediasoup.Worker;
  private router!: mediasoup.Router;

  async onModuleInit() {
    // ✅ Один вызов с полными настройками
    this.worker = await mediasoup.createWorker({
      logLevel: 'debug',
      logTags: [
        'info',
        'ice',
        'dtls',
        'rtp',
        'srtp',
        'rtcp',
        'transport',
        'worker',
      ],
      rtcMinPort: 40000,
      rtcMaxPort: 40100,
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
    console.log(`🔧 Creating ${direction} transport. PUBLIC_IP =`, PUBLIC_IP);

    try {
      const transport = await this.router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: PUBLIC_IP }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        appData: {},
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      return transport;
    } catch (err) {
      console.error('❌ Failed to create WebRtcTransport:', err);
      throw err;
    }
  }
}

export type RtpCapabilities = ReturnType<
  MediasoupService['getRouterRtpCapabilities']
>;
