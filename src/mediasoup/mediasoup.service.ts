import { Injectable, OnModuleInit } from '@nestjs/common';
import * as mediasoup from 'mediasoup';

@Injectable()
export class MediasoupService implements OnModuleInit {
  private worker!: mediasoup.types.Worker;
  private isInitializing = false;

  async onModuleInit() {
    await this.initWorker();
  }

  private async initWorker() {
    if (this.isInitializing) return;
    this.isInitializing = true;
    try {
      this.worker = (await mediasoup.createWorker({
        logLevel: 'warn',
        rtcMinPort: 40000,
        rtcMaxPort: 40100,
      })) as unknown as mediasoup.types.Worker;

      this.worker.on('died', () => {
        console.error('⚠️ Mediasoup worker died! Recreating worker...');
        setTimeout(() => {
          this.initWorker().catch((err) => {
            console.error('Failed to recreate Mediasoup worker:', err);
          });
        }, 1000);
      });

      console.log('✅ Mediasoup worker ready');
    } catch (err) {
      console.error('❌ Failed to initialize Mediasoup worker:', err);
    } finally {
      this.isInitializing = false;
    }
  }

  async createRouter(): Promise<mediasoup.types.Router> {
    if (!this.worker) {
      await this.initWorker();
    }
    return await this.worker.createRouter({
      mediaCodecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
          parameters: { 'x-google-start-bitrate': 1000 },
        },
      ],
    });
  }

  async createWebRtcTransport(
    router: mediasoup.types.Router,
  ): Promise<mediasoup.types.WebRtcTransport> {
    const announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP || '185.46.11.122';
    return await router.createWebRtcTransport({
      listenIps: [{ ip: '0.0.0.0', announcedIp }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,

      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
      initialAvailableOutgoingBitrate: 1000000,
    });
  }
}

/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'mediasoup' {
  export function createWorker(options: any): Promise<types.Worker>;

  export namespace types {
    export type MediaKind = 'audio' | 'video';

    export interface DtlsParameters {
      [key: string]: any;
    }

    export interface RtpParameters {
      [key: string]: any;
    }

    export interface RtpCapabilities {
      [key: string]: any;
    }

    export interface Worker {
      on(event: 'died', listener: () => void): void;
      close(): void;
      createRouter(options: { mediaCodecs: any[] }): Promise<Router>;
    }

    export interface Router {
      id: string;
      rtpCapabilities: RtpCapabilities;
      createWebRtcTransport(options: any): Promise<WebRtcTransport>;
      close(): void;
    }

    export interface WebRtcTransport {
      id: string;
      appData: any;
      iceParameters: {
        [x: string]: any;
        role: any;
      };
      iceCandidates: any[];
      dtlsParameters: DtlsParameters;
      connect(params: { dtlsParameters: DtlsParameters }): Promise<void>;
      produce(params: {
        kind: MediaKind;
        rtpParameters: RtpParameters;
      }): Promise<Producer>;
      consume(params: {
        producerId: string;
        rtpCapabilities: any;
        paused?: boolean;
      }): Promise<Consumer>;
      close(): void;
    }

    export interface Producer {
      [x: string]: any;
      id: string;
      kind: MediaKind;
      close(): void;
    }

    export interface Consumer {
      [x: string]: any;
      id: string;
      producerId: string;
      kind: MediaKind;
      rtpParameters: any;
      paused: boolean; // Полезно для отладки
      pause(): Promise<void>;
      resume(): Promise<void>; // ВОТ ЭТО ТО, ЧТО МЫ ДОБАВИЛИ
      close(): void;
    }
  }
}
