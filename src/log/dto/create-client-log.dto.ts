import { IsOptional, IsString, IsNumber } from 'class-validator';

export class CreateClientLogDto {
  @IsOptional()
  @IsNumber()
  userId?: number;

  @IsOptional()
  @IsString()
  userEmail?: string;

  @IsString()
  source!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  stack?: string;

  @IsOptional()
  context?: any;

  @IsOptional()
  @IsString()
  url?: string;
}
