import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { UserRole } from '../../generated/prisma/index.js';
import { AnnouncementsService } from './announcements.service.js';
import { PublishAnnouncementDto } from './dto/publish-announcement.dto.js';

/** Общесайтовый баннер (не привязан к заявке) — виден всем сразу после входа, пока
 * Главный сисадмин его не уберёт (см. план). Отличается от точечных Notification. */
@ApiTags('announcements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get('active')
  getActive() {
    return this.announcementsService.getActive();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Put('active')
  publish(@CurrentUser() user: AuthenticatedUser, @Body() dto: PublishAnnouncementDto) {
    return this.announcementsService.publish(user.id, dto.text);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete('active')
  @HttpCode(HttpStatus.NO_CONTENT)
  clear(@CurrentUser() user: AuthenticatedUser) {
    return this.announcementsService.clear(user.id);
  }
}
