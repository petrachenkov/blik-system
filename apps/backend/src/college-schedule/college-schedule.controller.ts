import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Post, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { UserRole } from '../../generated/prisma/index.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { CollegeScheduleService } from './college-schedule.service.js';
import { ScheduleMaxService } from './schedule-max.service.js';

const week = z.enum(['red', 'blue']);
const lesson = z.object({
  subject: z.string().trim().min(1).max(200),
  teacher: z.string().trim().max(150),
  room: z.string().trim().max(80),
  week: week.optional(),
});
const slot = z.object({
  group: z.string().min(1).max(80),
  day: z.string().min(1).max(25),
  pair: z.string().regex(/^\d{1,2}$/),
  lessons: z.array(lesson).max(12).nullable(),
});

@Controller('college-schedule')
export class CollegeScheduleController {
  constructor(private readonly service: CollegeScheduleService) {}

  @Get('schedule')
  schedule() {
    return this.service.schedule();
  }

  @Get('changes')
  changes() {
    return this.service.changes();
  }

  @Get('week')
  settings() {
    return this.service.settings();
  }
}

@Controller('college-schedule/manage')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SCHEDULE)
export class CollegeScheduleManagementController {
  constructor(private readonly service: CollegeScheduleService, private readonly max: ScheduleMaxService) {}

  @Put('week')
  setWeek(@Body('week') value: unknown) {
    const parsed = week.safeParse(value);
    if (!parsed.success) throw new BadRequestException('Выберите красную или синюю неделю');
    return this.service.setWeek(parsed.data);
  }

  @Put('announcement')
  setAnnouncement(@Body('text') value: unknown) {
    const parsed = z.string().trim().min(1).max(2000).nullable().safeParse(value);
    if (!parsed.success) throw new BadRequestException('Введите объявление до 2000 символов');
    return this.service.setAnnouncement(parsed.data);
  }

  @Post('broadcast')
  @HttpCode(HttpStatus.ACCEPTED)
  broadcast(@Body('text') value: unknown) {
    const parsed = z.string().trim().min(1).max(2000).safeParse(value);
    if (!parsed.success) throw new BadRequestException('Введите текст рассылки до 2000 символов');
    return this.max.broadcast(parsed.data);
  }

  @Put('lessons')
  async setLessons(@Body() value: unknown) {
    const parsed = slot.safeParse(value);
    if (!parsed.success) throw new BadRequestException('Проверьте группу, номер пары и данные занятий');
    const { group, day, pair, lessons } = parsed.data;
    await this.service.setLessons(group, day, pair, lessons);
    return { ok: true };
  }
}
