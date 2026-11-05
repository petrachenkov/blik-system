import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class SaveLocalServiceDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(80)
  name!: string;

  @Transform(trim) @IsOptional() @IsString() @MaxLength(240)
  description?: string;

  @Transform(trim)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  @MaxLength(2000)
  url!: string;

  @IsIn(['emoji', 'image'])
  iconType!: 'emoji' | 'image';

  @Transform(trim) @IsOptional() @IsString() @MaxLength(32)
  emoji?: string;

  @IsOptional() @IsString() @MaxLength(710000)
  imageData?: string | null;

  @IsInt() @Min(0) @Max(10000)
  sortOrder!: number;

  @IsBoolean()
  isActive!: boolean;
}

export class ServiceVisibilityDto {
  @IsBoolean()
  isActive!: boolean;
}
