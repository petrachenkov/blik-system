import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateFlagDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  /** Для maintenance_mode — текст баннера; для остальных флагов — произвольная пометка. */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
