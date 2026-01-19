import { IsNotEmpty } from 'class-validator';

export class createDmDto {
  @IsNotEmpty()
  participantId!: number;
}
