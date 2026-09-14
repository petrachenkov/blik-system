import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/** Преподаватель заполняет только локацию — код заявке присваивает система (см. план). */
export class CreateCartridgeRequestDto {
  @ApiProperty({ description: 'ID кабинета/помещения, откуда сдаётся картридж' })
  @IsString()
  locationId!: string;
}
