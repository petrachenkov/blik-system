import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UpdateCommentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  body!: string;
}
