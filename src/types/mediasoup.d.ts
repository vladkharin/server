// src/types/mediasoup.d.ts
declare module 'mediasoup' {
  export function createWorker(options: any): Promise<Worker>;

  export interface Worker {
    on(event: 'died', listener: () => void): void;
    close(): void;
    createRouter(options: { mediaCodecs: any[] }): Promise<Router>;
  }

  export interface Router {
    rtpCapabilities: any;
    createWebRtcTransport(options: any): Promise<WebRtcTransport>;
  }

  export interface WebRtcTransport {
    id: string;
    iceParameters: any;
    iceCandidates: any[];
    dtlsParameters: any;
    connect(params: { dtlsParameters: any }): Promise<void>;
    produce(params: {
      kind: 'audio' | 'video';
      rtpParameters: any;
    }): Promise<Producer>;
    consume(params: {
      producerId: string;
      rtpCapabilities: any;
      paused?: boolean;
    }): Promise<Consumer>;
    close(): void;
  }

  export interface Producer {
    id: string;
    close(): void;
    kind: string;
  }
}
