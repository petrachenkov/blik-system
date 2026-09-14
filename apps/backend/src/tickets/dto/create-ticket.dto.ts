import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/** Заявитель заполняет только это: локацию и описание проблемы (см. план). */
export class CreateTicketDto {
  @ApiProperty({ description: 'ID кабинета/помещения, где произошла проблема' })
  @IsString()
  locationId!: string;

  @ApiProperty({ example: 'Не включается компьютер, индикатор питания не горит' })
  @IsString()
  @MinLength(5)
  description!: string;
}
