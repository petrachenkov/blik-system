import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class MaxLoginDto {
  @ApiProperty({ description: 'Сырая подписанная строка window.WebApp.initData' })
  @IsString()
  @MinLength(1)
  initData!: string;
}

export class MaxLinkLoginDto extends MaxLoginDto {
  @ApiProperty({ example: 'ivanov_ii' })
  @IsString()
  username!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  password!: string;
}
