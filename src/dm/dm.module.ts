import { Module } from '@nestjs/common';
import { dmController } from './dm.controller';
import { dmService } from './dm.service';
import { UserService } from 'src/user/user.service';

@Module({
  controllers: [dmController],
  providers: [dmService, UserService],
  exports: [dmService],
})
export class DmModule {}
