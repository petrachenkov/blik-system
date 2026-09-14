import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// Singleton-запись — общесайтовый баннер всегда один, без истории версий (см. план).
const SINGLETON_ID = 'current';

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  // Всегда возвращает объект, а не null: NestJS при возврате буквального null из контроллера
  // отдаёт пустое тело ответа (не JSON "null"), из-за чего JSON.parse на клиенте падает.
  async getActive(): Promise<{ text: string | null; updatedAt: Date | null }> {
    const row = await this.prisma.announcement.findUnique({ where: { id: SINGLETON_ID } });
    return { text: row?.text ?? null, updatedAt: row?.updatedAt ?? null };
  }

  async publish(userId: string, text: string): Promise<{ text: string; updatedAt: Date }> {
    const row = await this.prisma.announcement.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, text, updatedById: userId },
      update: { text, updatedById: userId },
    });
    return { text: row.text!, updatedAt: row.updatedAt };
  }

  async clear(userId: string): Promise<void> {
    await this.prisma.announcement.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, text: null, updatedById: userId },
      update: { text: null, updatedById: userId },
    });
  }
}
