import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ErrorSource, NotificationType } from '../../generated/prisma/index.js';

export interface CaptureErrorParams {
  source: ErrorSource;
  message: string;
  stack?: string | null;
  route?: string | null;
  method?: string | null;
  statusCode?: number | null;
  userId?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class ErrorLogService {
  private readonly logger = new Logger(ErrorLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Первый значащий кадр стека — по нему группируем одинаковые ошибки в один «issue». */
  private fingerprint(message: string, stack?: string | null): string {
    const firstFrame = (stack ?? '')
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('at '));
    return createHash('sha256').update(`${message}\n${firstFrame ?? ''}`).digest('hex');
  }

  /**
   * Никогда не бросает — запись ошибки не должна ронять запрос и не должна повторно попадать
   * в глобальный фильтр (иначе рекурсия). Уведомление Главному сисадмину — только на НОВЫЙ
   * fingerprint, не на каждое повторение (иначе спам).
   */
  async capture(params: CaptureErrorParams): Promise<void> {
    try {
      const message = params.message.slice(0, 2000);
      const fingerprint = this.fingerprint(message, params.stack);

      const existing = await this.prisma.errorLog.findFirst({
        where: { fingerprint, resolvedAt: null },
        select: { id: true },
      });

      if (existing) {
        await this.prisma.errorLog.update({
          where: { id: existing.id },
          data: { count: { increment: 1 }, lastSeenAt: new Date() },
        });
        return;
      }

      const created = await this.prisma.errorLog.create({
        data: {
          source: params.source,
          fingerprint,
          message,
          stack: params.stack?.slice(0, 8000) ?? null,
          route: params.route ?? null,
          method: params.method ?? null,
          statusCode: params.statusCode ?? null,
          userId: params.userId ?? null,
          userAgent: params.userAgent?.slice(0, 500) ?? null,
        },
      });

      await this.notifications.notifySuperAdmins({
        type: NotificationType.SYSTEM_ERROR,
        title: `Новая ошибка в системе (${params.source === ErrorSource.BACKEND ? 'сервер' : 'интерфейс'})`,
        body: message.slice(0, 200),
      });

      this.logger.warn(`Зафиксирована новая ошибка ${created.id}: ${message.slice(0, 120)}`);
    } catch (error) {
      // Только в консоль — сюда попадать через глобальный фильтр нельзя.
      this.logger.error('Не удалось записать ошибку в ErrorLog', error instanceof Error ? error.stack : error);
    }
  }

  findRecent(includeResolved: boolean) {
    return this.prisma.errorLog.findMany({
      where: includeResolved ? {} : { resolvedAt: null },
      orderBy: { lastSeenAt: 'desc' },
      take: 200,
      include: { user: { select: { fullName: true } } },
    });
  }

  async resolve(id: string): Promise<void> {
    await this.prisma.errorLog.update({ where: { id }, data: { resolvedAt: new Date() } });
  }
}
