import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { StaffOnlyGuard } from '../common/guards/staff-only.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { UserRole } from '../../generated/prisma/index.js';
import { CartridgesService } from './cartridges.service.js';
import { CreateCartridgeRequestDto } from './dto/create-cartridge-request.dto.js';
import { FindCartridgesQueryDto } from './dto/find-cartridges-query.dto.js';

@ApiTags('cartridges')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cartridges')
export class CartridgesController {
  constructor(private readonly cartridgesService: CartridgesService) {}

  @UseGuards(StaffOnlyGuard)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCartridgeRequestDto) {
    return this.cartridgesService.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: FindCartridgesQueryDto) {
    return this.cartridgesService.findAll(user, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.cartridgesService.findOne(user, id);
  }

  /** Отметка получения на заправку — любой исполнитель, без формального назначения (см. план). */
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERN)
  @Patch(':id/collect')
  collect(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.cartridgesService.collect(user, id);
  }

  @Patch(':id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.cartridgesService.cancel(user, id);
  }
}
