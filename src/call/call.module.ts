import { Module } from '@nestjs/common';
import { callService } from './call.service';
import { DmModule } from 'src/dm/dm.module';
import { MediasoupService } from 'src/mediasoup/mediasoup.service';

@Module({
  imports: [DmModule],
  providers: [callService, MediasoupService],
  exports: [callService, MediasoupService],
})
export class CallModule {}
