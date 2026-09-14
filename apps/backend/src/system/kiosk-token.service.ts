import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class KioskTokenService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.kioskToken.findMany({
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { fullName: true } } },
    });
  }

  async create(label: string, userId: string) {
    const token = randomBytes(32).toString('base64url');
    const row = await this.prisma.kioskToken.create({ data: { token, label, createdById: userId } });
    return { id: row.id, label: row.label, token: row.token };
  }

  async revoke(id: string): Promise<void> {
    const existing = await this.prisma.kioskToken.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Ссылка не найдена');
    if (existing.revokedAt) return;
    await this.prisma.kioskToken.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  /** Возвращает id действующего токена или null. Обновляет lastSeenAt не чаще раза в минуту. */
  async resolveActive(token: string): Promise<string | null> {
    const row = await this.prisma.kioskToken.findUnique({ where: { token } });
    if (!row || row.revokedAt) return null;
    const stale = !row.lastSeenAt || Date.now() - row.lastSeenAt.getTime() > 60_000;
    if (stale) {
      await this.prisma.kioskToken.update({ where: { id: row.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
    }
    return row.id;
  }
}
