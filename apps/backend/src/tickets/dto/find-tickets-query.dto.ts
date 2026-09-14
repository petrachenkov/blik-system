import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBooleanString, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { TicketStatus } from '../../../generated/prisma/index.js';

export const TICKET_SORT_FIELDS = [
  'createdAt',
  'number',
  'priority',
  'status',
  'responseDueAt',
  'resolutionDueAt',
] as const;
export type TicketSortField = (typeof TICKET_SORT_FIELDS)[number];

export class FindTicketsQueryDto {
  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Фильтр по тегу заявки' })
  @IsOptional()
  @IsString()
  tagId?: string;

  @ApiPropertyOptional({ description: 'true — только просроченные заявки (по любому из SLA-флагов)' })
  @IsOptional()
  @IsBooleanString()
  overdue?: string;

  @ApiPropertyOptional({ description: 'Поиск по номеру, тексту описания и ФИО заявителя' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Фильтр по исполнителю' })
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'Фильтр по кабинету' })
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional({ description: 'true — показывать только архивные заявки (по умолчанию скрыты)' })
  @IsOptional()
  @IsBooleanString()
  archived?: string;

  @ApiPropertyOptional({ enum: TICKET_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(TICKET_SORT_FIELDS)
  sortBy?: TicketSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
