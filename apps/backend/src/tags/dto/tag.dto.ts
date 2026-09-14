import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsHexColor, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

const ANTD_COLORS = ['blue', 'cyan', 'green', 'gold', 'orange', 'red', 'volcano', 'purple', 'magenta', 'lime', 'geekblue'];

export class CreateTagDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name!: string;

  /** Имя цвета antd ("blue"/"red"/...) или hex. */
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => !ANTD_COLORS.includes(value))
  @IsHexColor()
  color?: string;
}

export class UpdateTagDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && !ANTD_COLORS.includes(value))
  @IsHexColor()
  color?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AddTagRuleDto {
  @ApiProperty({ example: 'вайфай' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  keyword!: string;
}
