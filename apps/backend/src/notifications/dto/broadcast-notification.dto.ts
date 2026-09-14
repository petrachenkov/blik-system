import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

/** targetUserId не указан -> рассылка всем пользователям системы (см. план). */
export class BroadcastNotificationDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  body!: string;

  @ApiPropertyOptional({ description: 'ID конкретного получателя. Не указан — рассылка всем.' })
  @IsOptional()
  @IsString()
  targetUserId?: string;
}
