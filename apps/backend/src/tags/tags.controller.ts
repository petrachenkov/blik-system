import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../../generated/prisma/index.js';
import { TagsService } from './tags.service.js';
import { AddTagRuleDto, CreateTagDto, UpdateTagDto } from './dto/tag.dto.js';

@ApiTags('tags')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  /** Чтение — всем аутентифицированным (фильтр по тегу в списке заявок, выбор тегов в детали). */
  @Get()
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.tagsService.findAll(includeInactive === 'true');
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateTagDto) {
    return this.tagsService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateTagDto) {
    return this.tagsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.tagsService.remove(id);
  }

  @Post(':id/rules')
  @Roles(UserRole.ADMIN)
  addRule(@Param('id') id: string, @Body() dto: AddTagRuleDto) {
    return this.tagsService.addRule(id, dto);
  }

  @Delete(':id/rules/:ruleId')
  @Roles(UserRole.ADMIN)
  removeRule(@Param('id') id: string, @Param('ruleId') ruleId: string) {
    return this.tagsService.removeRule(id, ruleId);
  }
}
