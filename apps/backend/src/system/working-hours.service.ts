import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { DEFAULT_WORKING_HOURS, type WorkingHours } from '../common/utils/working-hours.js';

/**
 * Рабочие часы для планирования визитов (см. план «Доработка календаря визитов»). Singleton
 * `id: 'current'`, по образцу NotificationsService.getQuietHours/setQuietHours. Редактируется
 * через /admin/working-hours, читается VisitsService при валидации окон.
 */
@Injectable()
export class WorkingHoursService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<WorkingHours> {
    const row = await this.prisma.workingHoursSettings.findUnique({ where: { id: 'current' } });
    if (!row) return { ...DEFAULT_WORKING_HOURS };
    return {
      workdayStart: row.workdayStart,
      workdayEnd: row.workdayEnd,
      workingDays: [...row.workingDays].sort((a, b) => a - b),
      holidays: [...row.holidays].sort(),
    };
  }

  async set(
    updatedById: string,
    data: Partial<WorkingHours>,
  ): Promise<WorkingHours> {
    const current = await this.get();
    const next: WorkingHours = {
      workdayStart: data.workdayStart ?? current.workdayStart,
      workdayEnd: data.workdayEnd ?? current.workdayEnd,
      workingDays: data.workingDays ?? current.workingDays,
      holidays: data.holidays ? [...new Set(data.holidays)].sort() : current.holidays,
    };
    await this.prisma.workingHoursSettings.upsert({
      where: { id: 'current' },
      update: { ...next, updatedById },
      create: { id: 'current', ...next, updatedById },
    });
    return next;
  }
}
