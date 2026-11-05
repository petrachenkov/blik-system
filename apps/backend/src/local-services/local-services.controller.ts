import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/index.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { SaveLocalServiceDto, ServiceVisibilityDto } from './local-service.dto.js';
import { LocalServicesService } from './local-services.service.js';

@ApiTags('local-services')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('local-services')
export class LocalServicesController {
  constructor(private readonly services: LocalServicesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('includeInactive') includeInactive?: string) {
    return this.services.findAll(user.role === UserRole.ADMIN && includeInactive === 'true');
  }

  @Post() @Roles(UserRole.ADMIN)
  create(@Body() dto: SaveLocalServiceDto) { return this.services.create(dto); }

  @Put(':id') @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: SaveLocalServiceDto) { return this.services.update(id, dto); }

  @Patch(':id/visibility') @Roles(UserRole.ADMIN)
  visibility(@Param('id') id: string, @Body() dto: ServiceVisibilityDto) { return this.services.setVisibility(id, dto.isActive); }

  @Delete(':id') @Roles(UserRole.ADMIN) @HttpCode(204)
  remove(@Param('id') id: string) { return this.services.remove(id); }
}
