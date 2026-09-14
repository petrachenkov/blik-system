import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CartridgeRequestStatus } from '../../../generated/prisma/index.js';

export const CARTRIDGE_SORT_FIELDS = ['createdAt', 'number', 'status'] as const;
export type CartridgeSortField = (typeof CARTRIDGE_SORT_FIELDS)[number];

export class FindCartridgesQueryDto {
  @ApiPropertyOptional({ enum: CartridgeRequestStatus })
  @IsOptional()
  @IsEnum(CartridgeRequestStatus)
  status?: CartridgeRequestStatus;

  @ApiPropertyOptional({ enum: CARTRIDGE_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(CARTRIDGE_SORT_FIELDS)
  sortBy?: CartridgeSortField;

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
