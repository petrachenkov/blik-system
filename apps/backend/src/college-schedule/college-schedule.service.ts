import { Injectable, Logger, NotFoundException, ServiceUnavailableException, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '../../generated/prisma/index.js';
import type { Env } from '../config/env.schema.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { describeSheetChanges, teachersIn } from './change-notifications.js';
import { ScheduleMaxService, type ScheduleNotice, type ScheduleTarget } from './schedule-max.service.js';
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

  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly max: ScheduleMaxService,
  ) {}

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
      await this.storeSnapshot(this.db, 'main', snapshot);
    });
    if (refreshed) this.nextMainRefreshAt = Date.now() + 20 * 60_000;
  }

  @Interval(90_000)
  refreshChanges() {
    return this.refresh('changes', async () => {
      const today = collegeDate.format(new Date());
      const { visible, upcoming } = await loadChanges(this.config.get('SCHEDULE_CHANGES_SHEET_ID', { infer: true }), today);
      await this.db.$transaction(async (tx) => {
        await this.max.lock(tx);
        const baseline = await tx.collegeScheduleSnapshot.findUnique({ where: { key: 'notification-changes' } });
        const previous = (baseline?.data ?? {}) as unknown as Record<string, ChangesSnapshot>;
        const latest = Object.fromEntries(Object.entries(previous).filter(([date]) => date >= today));
        const schedule = baseline && upcoming.length && this.max.configured() ? await this.readSchedule(tx) : undefined;
        for (const tab of upcoming) {
          const date = tab.isoDate!;
          if (baseline) await this.max.enqueueChanges(tx, describeSheetChanges(previous[date], tab, schedule));
          latest[date] = tab;
        }
        await this.storeSnapshot(tx, 'changes', visible);
        await this.storeSnapshot(tx, 'notification-changes', latest);
      });
    });
  }

  private async storeSnapshot(tx: Prisma.TransactionClient, key: string, snapshot: object | null) {
    const data = snapshot ? JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonObject : Prisma.JsonNull;
    await tx.collegeScheduleSnapshot.upsert({ where: { key }, create: { key, data }, update: { data } });
  }

  private async refresh(key: string, load: () => Promise<void>) {
    if (this.refreshing.has(key)) return;
    this.refreshing.add(key);
    try {
      await load();
      return true;
    } catch (error) {
      this.logger.warn(`Расписание (${key}): ${error instanceof Error ? error.message : 'ошибка загрузки'}`);
    } finally {
      this.refreshing.delete(key);
    }
  }

  private async readSchedule(db: Prisma.TransactionClient) {
    const [row, overrides] = await Promise.all([
      db.collegeScheduleSnapshot.findUnique({ where: { key: 'main' } }),
      db.collegeScheduleOverride.findMany(),
    ]);
    if (!row?.data) return undefined;
    const snapshot = row.data as unknown as MainScheduleSnapshot;
    for (const item of overrides) {
      const slot = snapshot.groups[item.group]?.slots.find(({ day, pair }) => day === item.day && pair === item.pair);
      if (slot) slot.lessons = item.lessons as unknown as Lesson[];
    }
    return snapshot;
  }

  async schedule() {
    const schedule = await this.readSchedule(this.db);
    if (!schedule) throw new ServiceUnavailableException('Расписание ещё загружается');
    return schedule;
  }

  async hasSubscriptionTarget(selection: ScheduleTarget) {
    const schedule = await this.schedule();
    if (selection.scope === 'group') return Object.hasOwn(schedule.groups, selection.target);
    return Object.values(schedule.groups).some((group) => group.slots.some((slot) =>
      slot.lessons.some((lesson) => teachersIn(lesson.teacher).includes(selection.target)),
    ));
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
    await this.db.$transaction(async (tx) => {
      await this.max.lock(tx);
      const previous = await tx.collegeScheduleSettings.findUnique({ where: { id: SETTINGS_ID } });
      await tx.collegeScheduleSettings.upsert({
        where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID, announcement: text }, update: { announcement: text },
      });
      if (text && previous?.announcement !== text) await this.max.enqueueAnnouncement(tx, `📢 Объявление колледжа\n\n${text}`);
    });
    return { announcement: text };
  }

  async setLessons(group: string, day: string, pair: string, lessons: Lesson[] | null) {
    const key = { group, day, pair };
    await this.db.$transaction(async (tx) => {
      await this.max.lock(tx);
      const row = await tx.collegeScheduleSnapshot.findUnique({ where: { key: 'main' } });
      const schedule = row?.data as unknown as MainScheduleSnapshot | undefined;
      const slot = schedule && Object.hasOwn(schedule.groups, group)
        ? schedule.groups[group].slots.find((item) => item.day === day && item.pair === pair) : undefined;
      const previous = await tx.collegeScheduleOverride.findUnique({ where: { group_day_pair: key } });
      if (lessons === null) {
        if (!previous) return;
        await tx.collegeScheduleOverride.deleteMany({ where: key });
      } else {
        if (!schedule) throw new ServiceUnavailableException('Расписание ещё загружается');
        if (!slot) throw new NotFoundException('Пара в расписании не найдена');
        const data = lessons.map(({ subject, teacher, room, week }) => ({ subject, teacher, room, ...(week ? { week } : {}) }));
        await tx.collegeScheduleOverride.upsert({
          where: { group_day_pair: key }, create: { ...key, lessons: data }, update: { lessons: data },
        });
      }
      if (!slot) return;
      const before = (previous?.lessons as unknown as Lesson[] | undefined) ?? slot.lessons;
      const after = lessons ?? slot.lessons;
      const signature = (items: Lesson[]) => JSON.stringify(items.map(({ subject, teacher, room, week }) => [subject, teacher, room, week]));
      if (signature(before) === signature(after)) return;
      const details = after.map((item) => [item.subject, item.teacher, item.room && `📍 ${item.room}`].filter(Boolean).join(' · '));
      const text = [`🔄 Расписание обновлено · ${group}`, `${day}, ${pair}-я пара`, ...(details.length ? details : ['Пара снята'])].join('\n');
      const teachers = new Set([...before, ...after].flatMap((lesson) => teachersIn(lesson.teacher)));
      const notices: ScheduleNotice[] = [{ scope: 'group', target: group, text }];
      for (const target of teachers) notices.push({ scope: 'teacher', target, text });
      await this.max.enqueueChanges(tx, notices);
    });
  }
}
