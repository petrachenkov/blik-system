import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateKioskTokenDto {
  @ApiProperty({ example: 'Дежурка, 2 корпус' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  label!: string;
}
