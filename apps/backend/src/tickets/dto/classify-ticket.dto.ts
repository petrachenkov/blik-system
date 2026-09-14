import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';
import { TicketPriority } from '../../../generated/prisma/index.js';

export class ClassifyTicketDto {
  @ApiProperty()
  @IsString()
  categoryId!: string;

  @ApiProperty({ enum: TicketPriority })
  @IsEnum(TicketPriority)
  priority!: TicketPriority;
}
