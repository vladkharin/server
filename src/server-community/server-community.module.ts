import { Module } from '@nestjs/common';
import { ServerCommunityService } from './server-community.service';
import { ServerCommunityGateway } from './server-community.gateway';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ServerCommunityService, ServerCommunityGateway],
  exports: [ServerCommunityService],
})
export class ServerCommunityModule {}
