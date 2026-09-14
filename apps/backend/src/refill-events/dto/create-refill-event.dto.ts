import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateRefillEventDto {
  @ApiProperty({ description: 'Дата и время отправки/забора картриджей (ISO)' })
  @IsDateString()
  scheduledAt!: string;

  @ApiProperty({ description: 'До какого момента можно сдать картридж на эту отправку (ISO)' })
  @IsDateString()
  submissionDeadline!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
