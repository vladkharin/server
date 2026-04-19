import { Module } from '@nestjs/common';
import { CallService } from './call.service';
import { DmModule } from 'src/dm/dm.module';
import { MediasoupService } from 'src/mediasoup/mediasoup.service';
import { CallGateway } from './call.gateway';

@Module({
  imports: [DmModule],
  providers: [CallService, MediasoupService, CallGateway],
  exports: [CallService, MediasoupService],
})
export class CallModule {}
