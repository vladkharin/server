import { Controller } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
} from '@nestjs/websockets';
import { dmService } from './dm.service';
import { Socket } from 'socket.io';
import { createDmDto } from './dto/dm.dto';

@Controller('private-chat')
export class dmController {
  constructor(private dmService: dmService) {}

  @SubscribeMessage('create.private.chat')
  handleMessage(
    @MessageBody() data: createDmDto,
    @ConnectedSocket() client: Socket,
  ) {
    console.log(data, client);
  }
}
