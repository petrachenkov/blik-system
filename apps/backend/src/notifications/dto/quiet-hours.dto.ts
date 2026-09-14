import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Оба поля не заданы (null/undefined) -> тихие часы выключены (см. план). */
export class UpdateQuietHoursDto {
  @ApiPropertyOptional({ example: '22:00' })
  @IsOptional()
  @Matches(HHMM_REGEX, { message: 'Ожидается формат HH:mm' })
  start?: string | null;

  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @Matches(HHMM_REGEX, { message: 'Ожидается формат HH:mm' })
  end?: string | null;
}
