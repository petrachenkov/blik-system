import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'ivanov_ii' })
  @IsString()
  username!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  password!: string;
}
