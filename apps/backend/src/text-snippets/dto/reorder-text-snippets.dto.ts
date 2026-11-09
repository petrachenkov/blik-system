import { ArrayNotEmpty, ArrayUnique, IsArray, IsEnum, IsString } from 'class-validator';
import { SnippetKind } from '../../../generated/prisma/index.js';

export class ReorderTextSnippetsDto {
  @IsEnum(SnippetKind)
  kind!: SnippetKind;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  ids!: string[];
}
