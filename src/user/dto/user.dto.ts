import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  surname: string;
  username: string;
}

export class CreateUserDto implements CreateUserDto {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  password!: string;

  @IsString()
  name!: string;

  @IsString()
  surname!: string;

  @IsString()
  username!: string;
}

export interface FindUserInput {
  name: string;
}

export class FindUserDto {
  @IsString()
  name!: string;
}
