import { Injectable, Logger, NotFoundException, ServiceUnavailableException, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '../../generated/prisma/index.js';
import type { Env } from '../config/env.schema.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { loadMainSchedule } from './sheets/parseMainSchedule.js';
import { loadChanges } from './sheets/parseChanges.js';
import type { ChangesSnapshot, Lesson, MainScheduleSnapshot, WeekColor } from './types.js';
import { colorForWeek, mondayOfIsoWeek } from './util/weekCycle.js';

const SETTINGS_ID = 1;
const collegeDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
});

@Injectable()
export class CollegeScheduleService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CollegeScheduleService.name);
  private readonly refreshing = new Set<string>();
  private nextMainRefreshAt = 0;

  constructor(private readonly db: PrismaService, private readonly config: ConfigService<Env, true>) {}

  onApplicationBootstrap() {
    void this.refreshSchedule();
    void this.refreshChanges();
  }

  @Interval(60_000)
  async refreshSchedule() {
    if (Date.now() < this.nextMainRefreshAt) return;
    const refreshed = await this.refresh('main', async () => {
      const snapshot = await loadMainSchedule(this.config.get('SCHEDULE_MAIN_SHEET_ID', { infer: true }));
      if (!Object.keys(snapshot.groups).length) throw new Error('В таблице расписания не найдены группы');
      return snapshot;
    });
    if (refreshed) this.nextMainRefreshAt = Date.now() + 20 * 60_000;
  }

  @Interval(90_000)
  refreshChanges() {
    return this.refresh('changes', () => loadChanges(this.config.get('SCHEDULE_CHANGES_SHEET_ID', { infer: true }), collegeDate.format(new Date())));
  }

  private async refresh(key: string, load: () => Promise<MainScheduleSnapshot | ChangesSnapshot | null>) {
    if (this.refreshing.has(key)) return;
    this.refreshing.add(key);
    try {
      const snapshot = await load();
      const data = snapshot ? JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonObject : Prisma.JsonNull;
      await this.db.collegeScheduleSnapshot.upsert({ where: { key }, create: { key, data }, update: { data } });
      return true;
    } catch (error) {
      this.logger.warn(`Расписание (${key}): ${error instanceof Error ? error.message : 'ошибка загрузки'}`);
    } finally {
      this.refreshing.delete(key);
    }
  }

  async schedule() {
    const [row, overrides] = await Promise.all([
      this.db.collegeScheduleSnapshot.findUnique({ where: { key: 'main' } }),
      this.db.collegeScheduleOverride.findMany(),
    ]);
    if (!row?.data) throw new ServiceUnavailableException('Расписание ещё загружается');
    const snapshot = row.data as unknown as MainScheduleSnapshot;
    for (const item of overrides) {
      const slot = snapshot.groups[item.group]?.slots.find(({ day, pair }) => day === item.day && pair === item.pair);
      if (slot) slot.lessons = item.lessons as unknown as Lesson[];
    }
    return snapshot;
  }

  async changes() {
    const row = await this.db.collegeScheduleSnapshot.findUnique({ where: { key: 'changes' } });
    return row?.data ?? null;
  }

  async settings() {
    const settings = await this.db.collegeScheduleSettings.findUnique({ where: { id: SETTINGS_ID } });
    const anchor = settings?.anchorMonday;
    const color = settings?.anchorColor;
    return {
      currentWeek: anchor && (color === 'red' || color === 'blue')
        ? colorForWeek(anchor, color, collegeDate.format(new Date()))
        : null,
      announcement: settings?.announcement ?? null,
    };
  }

  async setWeek(color: WeekColor) {
    const data = { anchorColor: color, anchorMonday: mondayOfIsoWeek(collegeDate.format(new Date())) };
    await this.db.collegeScheduleSettings.upsert({
      where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID, ...data }, update: data,
    });
    return { currentWeek: color };
  }

  async setAnnouncement(text: string | null) {
    await this.db.collegeScheduleSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, announcement: text },
      update: { announcement: text },
    });
    return { announcement: text };
  }

  async setLessons(group: string, day: string, pair: string, lessons: Lesson[] | null) {
    const key = { group, day, pair };
    if (lessons === null) {
      await this.db.collegeScheduleOverride.deleteMany({ where: key });
      return;
    }
    const schedule = await this.schedule();
    if (!Object.hasOwn(schedule.groups, group) || !schedule.groups[group].slots.some((slot) => slot.day === day && slot.pair === pair)) {
      throw new NotFoundException('Пара в расписании не найдена');
    }
    const data = lessons.map(({ subject, teacher, room, week }) => ({ subject, teacher, room, ...(week ? { week } : {}) }));
    await this.db.collegeScheduleOverride.upsert({
      where: { group_day_pair: key }, create: { ...key, lessons: data }, update: { lessons: data },
    });
  }
}
