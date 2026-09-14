import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export type CalendarTaskScope = 'mine' | 'all';

export class CreateCalendarTaskDto {
  @ApiProperty({ example: 'Обход кабинетов 2 этажа' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: '2026-09-15T10:00:00.000Z' })
  @IsDateString()
  start!: string;

  @ApiProperty({ example: '2026-09-15T12:00:00.000Z' })
  @IsDateString()
  end!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ description: 'Привязка к заявке (внутренняя работа без контакта с заявителем)' })
  @IsOptional()
  @IsString()
  ticketId?: string;

  @ApiPropertyOptional({ description: 'В чей календарь (только для сисадмина; иначе игнорируется)' })
  @IsOptional()
  @IsString()
  ownerId?: string;
}

export class UpdateCalendarTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  start?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  end?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  done?: boolean;
}

export class CalendarTasksQueryDto {
  @ApiProperty({ example: '2026-09-14T00:00:00.000Z' })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: '2026-09-21T00:00:00.000Z' })
  @IsDateString()
  to!: string;

  @ApiPropertyOptional({ enum: ['mine', 'all'], default: 'mine' })
  @IsOptional()
  @IsIn(['mine', 'all'])
  scope?: CalendarTaskScope;
}
