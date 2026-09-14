import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateTicketRetentionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ minimum: 7, maximum: 3650 })
  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(3650)
  archiveClosedAfterDays?: number;
}
