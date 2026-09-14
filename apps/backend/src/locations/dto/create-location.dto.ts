import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateLocationDto {
  @ApiProperty({ example: 'Корпус А' })
  @IsString()
  @MinLength(1)
  building!: string;

  @ApiProperty({ example: '204' })
  @IsString()
  @MinLength(1)
  room!: string;

  @ApiPropertyOptional({ example: 'Кабинет информатики' })
  @IsOptional()
  @IsString()
  label?: string;
}
