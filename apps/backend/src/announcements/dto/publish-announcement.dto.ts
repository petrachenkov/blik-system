import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class PublishAnnouncementDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  text!: string;
}
