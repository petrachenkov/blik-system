import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateKnowledgeArticleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(5)
  content?: string;

  /** Пустая строка снимает привязку к категории (обрабатывается сервисом как null). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;
}
