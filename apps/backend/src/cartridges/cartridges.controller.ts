import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
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
import { ScanArrivalDto } from './dto/scan-arrival.dto.js';
import { ExportLabelsDto } from './dto/export-labels.dto.js';

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

  /** Сканирование QR при возврате картриджа с заправки (см. план, часть B) — только staff. */
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERN)
  @Patch('scan-arrival')
  scanArrival(@CurrentUser() user: AuthenticatedUser, @Body() dto: ScanArrivalDto) {
    return this.cartridgesService.scanArrival(user, dto.code);
  }

  /** Excel этикеток для выбранных заявок — Label Expert подключает его как "базу" (см. план). */
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERN)
  @Post('labels/export')
  async exportLabels(@Body() dto: ExportLabelsDto, @Res() res: Response) {
    const buffer = await this.cartridgesService.exportLabels(dto.ids);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="cartridge-labels.xlsx"');
    res.send(buffer);
  }
}
