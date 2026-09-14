import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  body!: string;

  /**
   * ID статей базы знаний, прикреплённых к этому ответу (см. план "База знаний").
   * Приходит через multipart/form-data вместе с файлами — при одном значении busboy
   * отдаёт голую строку, а не массив из одного элемента, поэтому нормализуем сами.
   */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : value ? [value] : undefined))
  @IsArray()
  @IsString({ each: true })
  knowledgeArticleIds?: string[];

  /**
   * Внутренняя заметка — видна только сисадминам/практикантам/Главному сисадмину, не заявителю
   * (см. план "Внутренние заметки"). Через multipart форма отдаёт булево как строку "true"/"false".
   */
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isInternal?: boolean;

  /**
   * ID сотрудников, упомянутых через @ в тексте ответа (см. план "Упоминания") — как и
   * knowledgeArticleIds, приходит через multipart, при одном значении нужна та же нормализация.
   */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : value ? [value] : undefined))
  @IsArray()
  @IsString({ each: true })
  mentionedUserIds?: string[];
}
