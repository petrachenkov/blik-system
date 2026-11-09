import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MinLength, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

/** targetUserId не указан -> рассылка всем пользователям системы (см. план). */
export class BroadcastNotificationDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  body!: string;

  @ApiPropertyOptional({ description: 'ID конкретного получателя. Не указан — рассылка всем.' })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  targetUserId?: string;
}
