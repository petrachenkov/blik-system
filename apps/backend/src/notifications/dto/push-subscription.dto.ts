import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

class PushSubscriptionKeysDto {
  @ApiProperty()
  @IsString()
  p256dh!: string;

  @ApiProperty()
  @IsString()
  auth!: string;
}

/**
 * Ровно то, что отдаёт браузерный PushSubscription.toJSON() (см. план "Push-уведомления").
 * expirationTime обязателен здесь как поле (может быть null) — ValidationPipe глобально
 * настроен с forbidNonWhitelisted: true (main.ts), и без объявления этого поля реальный
 * запрос браузера (toJSON() всегда включает expirationTime, обычно null) отклонялся 400-й
 * ошибкой ещё до попадания в контроллер — именно это и было причиной "push не включается".
 */
export class PushSubscriptionDto {
  @ApiProperty()
  @IsString()
  endpoint!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  expirationTime?: number | null;

  @ApiProperty({ type: PushSubscriptionKeysDto })
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;
}
