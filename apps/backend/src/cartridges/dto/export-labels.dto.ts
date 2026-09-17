import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsString } from 'class-validator';

/** Какие заявки включить в Excel-файл этикеток (см. план "Печать этикеток картриджей"). */
export class ExportLabelsDto {
  @ApiProperty({ description: 'ID заявок на заправку картриджа (только в статусе NEW)', type: [String] })
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids!: string[];
}
