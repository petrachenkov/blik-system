import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { TicketStatus } from '../../../generated/prisma/index.js';

export const BULK_TICKET_ACTIONS = ['assign', 'status', 'addTags', 'removeTags', 'archive'] as const;
export type BulkTicketAction = (typeof BULK_TICKET_ACTIONS)[number];

export class BulkTicketActionDto {
  @ApiProperty({ type: [String], description: 'ID заявок (до 100)' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids!: string[];

  @ApiProperty({ enum: BULK_TICKET_ACTIONS })
  @IsIn(BULK_TICKET_ACTIONS)
  action!: BulkTicketAction;

  @ApiPropertyOptional({ description: 'для action=assign' })
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional({ enum: TicketStatus, description: 'для action=status' })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({ type: [String], description: 'для action=addTags/removeTags' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];

  @ApiPropertyOptional({ description: 'для action=archive (по умолчанию true)' })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class AddCollaboratorDto {
  @ApiProperty()
  @IsString()
  userId!: string;
}

export class SetArchivedDto {
  @ApiProperty()
  @IsBoolean()
  archived!: boolean;
}
