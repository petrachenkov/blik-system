import { Body, Controller, Get, Param, ParseEnumPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { TicketPriority, UserRole } from '../../generated/prisma/index.js';
import { SlaService } from './sla.service.js';
import { UpdateSlaConfigDto } from './dto/update-sla-config.dto.js';

@ApiTags('sla-configs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sla-configs')
export class SlaController {
  constructor(private readonly slaService: SlaService) {}

  @Get()
  findAll() {
    return this.slaService.findAll();
  }

  @Put(':priority')
  @Roles(UserRole.ADMIN)
  update(
    @Param('priority', new ParseEnumPipe(TicketPriority)) priority: TicketPriority,
    @Body() dto: UpdateSlaConfigDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.slaService.update(priority, dto, user.id);
  }
}
