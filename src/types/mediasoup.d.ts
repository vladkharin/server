declare module 'mediasoup' {
  export function createWorker(options: any): Promise<Worker>;

  export interface Worker {
    on(event: 'died', listener: () => void): void;
    close(): void;
    createRouter(options: { mediaCodecs: any[] }): Promise<Router>;
  }

  export interface Router {
    id: string;
    rtpCapabilities: any;
    createWebRtcTransport(options: any): Promise<WebRtcTransport>;
    close(): void; // Добавили для корректного закрытия комнат
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
    kind: 'audio' | 'video';
    close(): void;
  }

  export interface Consumer {
    id: string;
    producerId: string;
    kind: 'audio' | 'video';
    rtpParameters: any;
    close(): void;
  }
}
