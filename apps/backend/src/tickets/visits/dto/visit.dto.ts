import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export type VisitCalendarScope = 'mine' | 'all';

export class VisitSlotDto {
  @ApiProperty({ example: '2026-09-15T10:00:00.000Z' })
  @IsDateString()
  start!: string;

  @ApiProperty({ example: '2026-09-15T12:00:00.000Z' })
  @IsDateString()
  end!: string;
}

export class ProposeVisitDto {
  @ApiProperty({ type: [VisitSlotDto], description: '1–3 предложенных окна' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => VisitSlotDto)
  slots!: VisitSlotDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ConfirmVisitDto {
  @ApiProperty()
  @IsString()
  slotId!: string;
}

export class UpdateVisitStatusDto {
  @ApiProperty({ enum: ['DONE', 'CANCELLED'] })
  @IsIn(['DONE', 'CANCELLED'])
  status!: 'DONE' | 'CANCELLED';
}

export class RescheduleVisitDto {
  @ApiProperty({ example: '2026-09-15T10:00:00.000Z' })
  @IsDateString()
  start!: string;

  @ApiProperty({ example: '2026-09-15T11:00:00.000Z' })
  @IsDateString()
  end!: string;
}

export class VisitCalendarQueryDto {
  @ApiProperty({ example: '2026-09-14T00:00:00.000Z' })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: '2026-09-21T00:00:00.000Z' })
  @IsDateString()
  to!: string;

  @ApiPropertyOptional({ enum: ['mine', 'all'], default: 'mine' })
  @IsOptional()
  @IsIn(['mine', 'all'])
  scope?: VisitCalendarScope;
}

export class VisitConflictsQueryDto {
  @ApiProperty()
  @IsString()
  technicianId!: string;

  @ApiProperty({ example: '2026-09-15T10:00:00.000Z' })
  @IsDateString()
  start!: string;

  @ApiProperty({ example: '2026-09-15T11:00:00.000Z' })
  @IsDateString()
  end!: string;
}
