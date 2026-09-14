import { Controller, Get, Param, Patch, Post, Body, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { UserRole } from '../../generated/prisma/index.js';
import { CartridgeReportsService } from './cartridge-reports.service.js';
import { GenerateCartridgeReportDto } from './dto/generate-report.dto.js';

/** Архив отчётов на заправку картриджей — доступен только Главному сисадмину (см. план). */
@ApiTags('cartridge-reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('cartridge-reports')
export class CartridgeReportsController {
  constructor(private readonly reportsService: CartridgeReportsService) {}

  @Get()
  findAll() {
    return this.reportsService.findAll();
  }

  @Post()
  generate(@CurrentUser() user: AuthenticatedUser, @Body() dto: GenerateCartridgeReportDto) {
    return this.reportsService.generate(user, dto);
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const { report, absolutePath } = await this.reportsService.getForDownload(id);
    res.download(absolutePath, report.filename);
  }

  @Patch(':id/close')
  close(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.reportsService.close(user, id);
  }
}
