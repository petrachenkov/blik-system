import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MinLength } from 'class-validator';
import { SnippetKind } from '../../../generated/prisma/index.js';

export class CreateTextSnippetDto {
  @ApiProperty({ enum: SnippetKind })
  @IsEnum(SnippetKind)
  kind!: SnippetKind;

  @ApiProperty({ example: 'Не работает принтер' })
  @IsString()
  @MinLength(2)
  title!: string;

  @ApiProperty({ example: 'Принтер в кабинете не печатает, индикатор мигает красным.' })
  @IsString()
  @MinLength(2)
  body!: string;
}
