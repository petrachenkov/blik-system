import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SearchQueryDto {
  @ApiProperty({ description: 'Строка поиска (минимум 2 символа)' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q!: string;
}
