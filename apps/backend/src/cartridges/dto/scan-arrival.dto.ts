import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

/** Сканирование QR на этикетке при возврате картриджа с заправки (см. план, часть B). */
export class ScanArrivalDto {
  @ApiProperty({ description: '4-значный код картриджа, считанный сканером с этикетки' })
  @IsString()
  @Length(4, 4)
  code!: string;
}
