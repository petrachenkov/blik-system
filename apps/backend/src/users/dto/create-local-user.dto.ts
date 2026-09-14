import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { UserRole } from '../../../generated/prisma/index.js';

export class CreateLocalUserDto {
  @ApiProperty({ example: 'ivanov.local' })
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9._-]+$/, { message: 'Логин: латиница, цифры, точка, дефис, подчёркивание' })
  username!: string;

  @ApiProperty({ example: 'Иванов Иван Иванович' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;
}
