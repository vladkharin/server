import { IsNotEmpty, IsString, IsStrongPassword } from 'class-validator';

export class signInDto {
  @IsNotEmpty()
  @IsStrongPassword()
  password: string;

  @IsString()
  username: string;
}
