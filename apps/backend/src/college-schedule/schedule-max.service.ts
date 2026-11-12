import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import type { Prisma } from '../../generated/prisma/index.js';
import type { Env } from '../config/env.schema.js';
import { validateMaxInitData } from '../integrations/max/max-init-data.util.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type ScheduleTarget = { scope: 'group' | 'teacher'; target: string };
export type ScheduleNotice = ScheduleTarget & { text: string };

@Injectable()
export class ScheduleMaxService {
  private readonly logger = new Logger(ScheduleMaxService.name);
  private delivering = false;
  private miniApp: { url: string; expires: number } | undefined;

  constructor(private readonly config: ConfigService<Env, true>, private readonly db: PrismaService) {}

  private token() {
    const token = this.config.get('SCHEDULE_MAX_BOT_TOKEN', { infer: true });
    if (token && token !== this.config.get('MAX_BOT_TOKEN', { infer: true }) &&
        this.config.get('SCHEDULE_MAX_WEBHOOK_SECRET', { infer: true })) return token;
  }

  configured() {
    return Boolean(this.token());
  }

  identify(initData: string) {
    const token = this.token();
    if (!token) throw new ServiceUnavailableException('Бот расписания не настроен');
    const data = validateMaxInitData(initData, token);
    if (!data) throw new UnauthorizedException('Откройте расписание заново из бота расписания в MAX');
    return data.userId;
  }

  async miniAppUrl() {
    const token = this.token();
    if (!token) return null;
    if (this.miniApp && this.miniApp.expires > Date.now()) return this.miniApp.url;
    const response = await fetch('https://platform-api2.max.ru/me', {
      headers: { Authorization: token }, signal: AbortSignal.timeout(4000), redirect: 'error',
    }).catch(() => null);
    if (!response?.ok) {
      await response?.body?.cancel();
      return null;
    }
    const bot = await response.json().catch(() => null) as { username?: string } | null;
    if (typeof bot?.username !== 'string' || !/^[a-z0-9_]+$/i.test(bot.username)) return null;
    const url = `https://max.ru/${bot.username}?startapp`;
    this.miniApp = { url, expires: Date.now() + 60 * 60_000 };
    return url;
  }

  async subscription(userId: string) {
    const row = await this.db.collegeScheduleMaxSubscriber.findUnique({ where: { userId } });
    const selection = row?.target && (row.scope === 'group' || row.scope === 'teacher')
      ? { scope: row.scope, target: row.target } : null;
    return { announcements: row?.announcements ?? false, selection };
  }

  async setSubscription(userId: string, announcements: boolean, selection: ScheduleTarget | null) {
    await this.db.$transaction(async (tx) => {
      await this.lock(tx);
      if (!announcements && !selection) {
        await tx.collegeScheduleMaxSubscriber.deleteMany({ where: { userId } });
        return;
      }
      const data = { announcements, scope: selection?.scope ?? null, target: selection?.target ?? null };
      await tx.collegeScheduleMaxSubscriber.upsert({ where: { userId }, create: { userId, ...data }, update: data });
      const filters: Prisma.CollegeScheduleMaxDeliveryWhereInput[] = [];
      if (!announcements) filters.push({ scope: null });
      filters.push(selection
        ? { scope: { not: null }, OR: [{ scope: { not: selection.scope } }, { target: { not: selection.target } }] }
        : { scope: { not: null } });
      await tx.collegeScheduleMaxDelivery.deleteMany({ where: { userId, OR: filters } });
    });
    return { announcements, selection };
  }

  async lock(tx: Prisma.TransactionClient) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(420938116)`;
  }

  async enqueueAnnouncement(tx: Prisma.TransactionClient, text: string) {
    if (!this.configured()) return 0;
    const subscribers = await tx.collegeScheduleMaxSubscriber.findMany({
      where: { announcements: true }, select: { userId: true },
    });
    if (subscribers.length) await tx.collegeScheduleMaxDelivery.createMany({
      data: subscribers.map(({ userId }) => ({ userId, text })),
    });
    return subscribers.length;
  }

  async broadcast(text: string) {
    if (!this.configured()) throw new ServiceUnavailableException('Бот расписания не настроен');
    return this.db.$transaction(async (tx) => {
      await this.lock(tx);
      const count = await this.enqueueAnnouncement(tx, `📣 Сообщение колледжа\n\n${text}`);
      return { count };
    });
  }

  async enqueueChanges(tx: Prisma.TransactionClient, notices: ScheduleNotice[]) {
    if (!this.configured() || !notices.length) return;
    const subscribers = await tx.collegeScheduleMaxSubscriber.findMany({
      where: { OR: notices.map(({ scope, target }) => ({ scope, target })) },
      select: { userId: true, scope: true, target: true },
    });
    const texts = new Map(notices.map(({ scope, target, text }) => [`${scope}:${target}`, text]));
    if (subscribers.length) await tx.collegeScheduleMaxDelivery.createMany({ data: subscribers.map(({ userId, scope, target }) => ({
      userId, scope, target, text: texts.get(`${scope}:${target}`)!,
    })) });
  }

  private async send(userId: string, text: string, selection?: ScheduleTarget) {
    const token = this.token();
    if (!token) throw new ServiceUnavailableException('Бот расписания не настроен');
    const url = new URL('https://platform-api2.max.ru/messages');
    url.searchParams.set('user_id', userId);
    const scheduleUrl = new URL('/schedule', this.config.get('CORS_ORIGIN', { infer: true }).split(',')[0].trim());
    if (selection) scheduleUrl.searchParams.set(selection.scope, selection.target);
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(4000),
      redirect: 'error',
      body: JSON.stringify({
        text: text.length > 3500 ? `${text.slice(0, 3499).trimEnd()}…` : text,
        attachments: [{ type: 'inline_keyboard', payload: { buttons: [[
          { type: 'link', text: 'Открыть расписание', url: scheduleUrl.href },
        ]] } }],
      }),
    });
    await response.body?.cancel().catch(() => undefined);
    return response.status;
  }

  async reply(userId: string, text: string) {
    const status = await this.send(userId, text);
    if (status >= 300) throw new ServiceUnavailableException('MAX временно не принял сообщение');
  }

  @Interval(5_000)
  async deliver() {
    if (this.delivering || !this.configured()) return;
    this.delivering = true;
    try {
      const now = new Date();
      const items = await this.db.collegeScheduleMaxDelivery.findMany({
        where: { availableAt: { lte: now } },
        orderBy: [{ availableAt: 'asc' }, { id: 'asc' }], take: 25,
      });
      const recipients = new Set<string>();
      const batch = items.filter(({ userId }) => {
        if (recipients.has(userId)) return false;
        recipients.add(userId);
        return true;
      });
      await Promise.allSettled(batch.map(async (item) => {
        const where = { id: item.id, availableAt: item.availableAt };
        const claim = await this.db.collegeScheduleMaxDelivery.updateMany({
          where, data: { availableAt: new Date(Date.now() + 30_000) },
        });
        if (!claim.count) return;
        const selection = item.target && (item.scope === 'group' || item.scope === 'teacher')
          ? { scope: item.scope, target: item.target } as ScheduleTarget : undefined;
        const status = await this.send(item.userId, item.text, selection).catch(() => 503);
        const retry = status === 408 || status === 429 || status >= 500;
        if (retry && item.attempts < 5) {
          await this.db.collegeScheduleMaxDelivery.updateMany({ where: { id: item.id }, data: {
            attempts: { increment: 1 }, availableAt: new Date(Date.now() + 15_000 * 2 ** item.attempts),
          } });
        } else {
          if (status >= 300) this.logger.warn(`MAX не доставил уведомление расписания (HTTP ${status})`);
          await this.db.collegeScheduleMaxDelivery.deleteMany({ where: { id: item.id } });
        }
      })).then((results) => {
        if (results.some(({ status }) => status === 'rejected')) this.logger.warn('Не удалось обработать очередь уведомлений расписания');
      });
    } finally {
      this.delivering = false;
    }
  }
}
