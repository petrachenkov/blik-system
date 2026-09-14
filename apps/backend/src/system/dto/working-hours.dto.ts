import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Частичное обновление рабочих часов визитов (см. план). Любое поле необязательно. */
export class UpdateWorkingHoursDto {
  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @Matches(HHMM_REGEX, { message: 'Ожидается формат HH:mm' })
  workdayStart?: string;

  @ApiPropertyOptional({ example: '19:00' })
  @IsOptional()
  @Matches(HHMM_REGEX, { message: 'Ожидается формат HH:mm' })
  workdayEnd?: string;

  @ApiPropertyOptional({ example: [1, 2, 3, 4, 5], description: '1=Пн … 7=Вс' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  workingDays?: number[];

  @ApiPropertyOptional({ example: ['2026-01-01', '2026-05-09'], description: 'Нерабочие даты YYYY-MM-DD' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(365)
  @Matches(DATE_REGEX, { each: true, message: 'Ожидается формат YYYY-MM-DD' })
  holidays?: string[];
}
