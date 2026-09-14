import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { UserRole } from '../../../generated/prisma/index.js';
import { CalendarTasksService } from './calendar-tasks.service.js';
import { CalendarTasksQueryDto, CreateCalendarTaskDto, UpdateCalendarTaskDto } from './dto/calendar-task.dto.js';

@ApiTags('calendar-tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.INTERN)
@Controller()
export class CalendarTasksController {
  constructor(private readonly tasks: CalendarTasksService) {}

  @Get('calendar/tasks')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: CalendarTasksQueryDto) {
    return this.tasks.list(user, {
      from: new Date(query.from),
      to: new Date(query.to),
      scope: query.scope ?? 'mine',
    });
  }

  @Get('tickets/:id/tasks')
  listByTicket(@CurrentUser() user: AuthenticatedUser, @Param('id') ticketId: string) {
    return this.tasks.listByTicket(user, ticketId);
  }

  @Post('calendar/tasks')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCalendarTaskDto) {
    return this.tasks.create(user, dto);
  }

  @Patch('calendar/tasks/:id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateCalendarTaskDto) {
    return this.tasks.update(user, id, dto);
  }

  @Delete('calendar/tasks/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tasks.remove(user, id);
  }
}
