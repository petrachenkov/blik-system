import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * assigneeId не указан -> сисадмин назначает себя (самоназначение на неназначенную заявку).
 * assigneeId указан -> доступно только Главному сисадмину (назначение любому исполнителю).
 */
export class AssignTicketDto {
  @ApiPropertyOptional({ description: 'ID исполнителя. Не указан — самоназначение.' })
  @IsOptional()
  @IsString()
  assigneeId?: string;
}
