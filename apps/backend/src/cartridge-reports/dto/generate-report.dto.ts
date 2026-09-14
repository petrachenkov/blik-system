import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class GenerateCartridgeReportDto {
  @ApiProperty({ type: [String], description: 'ID заявок в статусе COLLECTED, которые войдут в отчёт' })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  requestIds!: string[];
}
