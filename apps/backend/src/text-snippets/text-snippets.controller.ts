import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { SnippetKind, UserRole } from '../../generated/prisma/index.js';
import { TextSnippetsService } from './text-snippets.service.js';
import { CreateTextSnippetDto } from './dto/create-text-snippet.dto.js';
import { UpdateTextSnippetDto } from './dto/update-text-snippet.dto.js';

@ApiTags('text-snippets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('text-snippets')
export class TextSnippetsController {
  constructor(private readonly textSnippetsService: TextSnippetsService) {}

  /** Чтение доступно всем аутентифицированным — шаблоны заявок нужны и заявителям (USER). */
  @Get()
  findAll(@Query('kind') kind?: string, @Query('includeInactive') includeInactive?: string) {
    if (kind && !Object.values(SnippetKind).includes(kind as SnippetKind)) {
      throw new BadRequestException('Некорректный тип шаблона');
    }
    return this.textSnippetsService.findAll(kind as SnippetKind | undefined, includeInactive === 'true');
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateTextSnippetDto) {
    return this.textSnippetsService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateTextSnippetDto) {
    return this.textSnippetsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.textSnippetsService.remove(id);
  }
}
