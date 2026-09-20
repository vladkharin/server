import { IsEmail, IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';

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
  @Length(3, 32, { message: 'Никнейм должен содержать от 3 до 32 символов' })
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message: 'Никнейм может содержать только латинские буквы (a-z), цифры и символы _ . -',
  })
  username!: string;
}

export interface FindUserInput {
  name: string;
}

export class FindUserDto {
  @IsString()
  name!: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(3, 32, { message: 'Никнейм должен содержать от 3 до 32 символов' })
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message: 'Никнейм может содержать только латинские буквы (a-z), цифры и символы _ . -',
  })
  username?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  surname?: string;
}

