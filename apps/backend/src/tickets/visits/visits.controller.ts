import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { UserRole } from '../../../generated/prisma/index.js';
import { VisitsService } from './visits.service.js';
import {
  ConfirmVisitDto,
  ProposeVisitDto,
  RescheduleVisitDto,
  UpdateVisitStatusDto,
  VisitCalendarQueryDto,
  VisitConflictsQueryDto,
} from './dto/visit.dto.js';

@ApiTags('visits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @Get('visits/calendar')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERN)
  calendar(@CurrentUser() user: AuthenticatedUser, @Query() query: VisitCalendarQueryDto) {
    return this.visitsService.calendar(user, {
      from: new Date(query.from),
      to: new Date(query.to),
      scope: query.scope ?? 'mine',
    });
  }

  @Get('visits/conflicts')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERN)
  conflicts(@Query() query: VisitConflictsQueryDto) {
    return this.visitsService.findTechnicianConflicts(
      query.technicianId,
      new Date(query.start),
      new Date(query.end),
    );
  }

  @Get('tickets/:id/visits')
  list(@CurrentUser() user: AuthenticatedUser, @Param('id') ticketId: string) {
    return this.visitsService.findByTicket(user, ticketId);
  }

  @Post('tickets/:id/visits')
  propose(@CurrentUser() user: AuthenticatedUser, @Param('id') ticketId: string, @Body() dto: ProposeVisitDto) {
    return this.visitsService.propose(user, ticketId, dto);
  }

  @Patch('visits/:visitId/confirm')
  confirm(@CurrentUser() user: AuthenticatedUser, @Param('visitId') visitId: string, @Body() dto: ConfirmVisitDto) {
    return this.visitsService.confirm(user, visitId, dto);
  }

  /** Заявитель предлагает своё время (1–3 окна) — подтверждает потом сотрудник. */
  @Patch('visits/:visitId/counter')
  counter(@CurrentUser() user: AuthenticatedUser, @Param('visitId') visitId: string, @Body() dto: ProposeVisitDto) {
    return this.visitsService.counter(user, visitId, dto);
  }

  /** Перенос подтверждённого визита — перетаскивание в календаре. */
  @Patch('visits/:visitId/reschedule')
  reschedule(@CurrentUser() user: AuthenticatedUser, @Param('visitId') visitId: string, @Body() dto: RescheduleVisitDto) {
    return this.visitsService.reschedule(user, visitId, dto);
  }

  @Patch('visits/:visitId/status')
  setStatus(@CurrentUser() user: AuthenticatedUser, @Param('visitId') visitId: string, @Body() dto: UpdateVisitStatusDto) {
    return this.visitsService.setStatus(user, visitId, dto.status);
  }
}
