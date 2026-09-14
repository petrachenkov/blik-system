import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { UserRole } from '../../generated/prisma/index.js';
import { RefillEventsService } from './refill-events.service.js';
import { CreateRefillEventDto } from './dto/create-refill-event.dto.js';
import { UpdateRefillEventDto } from './dto/update-refill-event.dto.js';

@ApiTags('refill-events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('refill-events')
export class RefillEventsController {
  constructor(private readonly refillEventsService: RefillEventsService) {}

  /** Видно всем — преподаватели видят баннер ближайшей плановой заправки. */
  @Get()
  findAll() {
    return this.refillEventsService.findAll();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRefillEventDto) {
    return this.refillEventsService.create(user, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRefillEventDto) {
    return this.refillEventsService.update(id, dto);
  }
}
