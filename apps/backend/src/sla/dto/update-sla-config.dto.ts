import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class UpdateSlaConfigDto {
  @ApiProperty({ description: 'Срок на первую реакцию, в минутах', example: 120 })
  @IsInt()
  @Min(1)
  responseMinutes!: number;

  @ApiProperty({ description: 'Срок на решение заявки, в минутах', example: 1440 })
  @IsInt()
  @Min(1)
  resolutionMinutes!: number;
}
