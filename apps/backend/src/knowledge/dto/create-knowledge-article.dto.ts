import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateKnowledgeArticleDto {
  @ApiProperty({ example: 'Не включается проектор в кабинете' })
  @IsString()
  @MinLength(3)
  title!: string;

  @ApiProperty({ example: 'Проверить, включён ли проектор в розетку и не переключён ли источник сигнала...' })
  @IsString()
  @MinLength(5)
  content!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;
}
