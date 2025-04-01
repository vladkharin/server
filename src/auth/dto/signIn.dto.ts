import { IsEmail, IsNotEmpty } from 'class-validator';

export class signInDto {
  @IsNotEmpty()
  password: string;

  @IsEmail()
  email: string;
}
