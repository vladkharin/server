import { Module } from '@nestjs/common';
import { callService } from './call.service';
import { DmModule } from 'src/dm/dm.module';

@Module({
  imports: [DmModule],
  providers: [callService],
  exports: [callService],
})
export class CallModule {}
