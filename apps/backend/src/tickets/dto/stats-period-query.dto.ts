import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

/** Необязательный период для статистики по исполнителям (см. план "Отчёт по статистике за период").
 *  Без обоих полей — весь период целиком, как раньше. */
export class StatsPeriodQueryDto {
  @ApiPropertyOptional({ description: 'Начало периода (включительно), ISO-дата' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Конец периода (включительно), ISO-дата' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
