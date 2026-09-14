import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ALL_FLAG_KEYS, FEATURE_FLAG_KEYS, FEATURE_FLAG_META, MAINTENANCE_FLAG_KEY } from './feature-flags.js';

interface CachedFlags {
  values: Map<string, boolean>;
  expiresAt: number;
}

const CACHE_TTL_MS = 15_000;

@Injectable()
export class FeatureFlagsService {
  private cache: CachedFlags | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async load(): Promise<Map<string, boolean>> {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.values;
    }
    const rows = await this.prisma.systemFlag.findMany();
    const values = new Map<string, boolean>(rows.map((r) => [r.key, r.enabled]));
    this.cache = { values, expiresAt: Date.now() + CACHE_TTL_MS };
    return values;
  }

  /** Ключа нет в таблице (сид не проходил) — считаем включённым, чтобы не отключить фичу молча. */
  async isEnabled(key: string): Promise<boolean> {
    const values = await this.load();
    return values.get(key) ?? true;
  }

  /** Карта только для клиента: ключи реестра фич, без maintenance_mode (у него отдельный публичный путь). */
  async getPublicFlags(): Promise<Record<string, boolean>> {
    const values = await this.load();
    return Object.fromEntries(FEATURE_FLAG_KEYS.map((key) => [key, values.get(key) ?? true]));
  }

  /** Полный список для админки — с note/updatedAt/меткой. */
  async getAdminFlags() {
    const rows = await this.prisma.systemFlag.findMany({
      include: { updatedBy: { select: { fullName: true } } },
    });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return ALL_FLAG_KEYS.map((key) => {
      const row = byKey.get(key);
      const meta = FEATURE_FLAG_META[key] ?? { label: key, description: '' };
      return {
        key,
        label: meta.label,
        description: meta.description,
        enabled: row?.enabled ?? true,
        note: row?.note ?? null,
        updatedAt: row?.updatedAt ?? null,
        updatedByName: row?.updatedBy?.fullName ?? null,
        isMaintenance: key === MAINTENANCE_FLAG_KEY,
      };
    });
  }

  async set(key: string, enabled: boolean, note: string | null, userId: string) {
    const row = await this.prisma.systemFlag.upsert({
      where: { key },
      update: { enabled, note, updatedById: userId },
      create: { key, enabled, note, updatedById: userId },
    });
    this.cache = null;
    return row;
  }

  /** Текст баннера режима обслуживания хранится в note того же ряда. */
  async getMaintenance(): Promise<{ enabled: boolean; message: string | null }> {
    const row = await this.prisma.systemFlag.findUnique({ where: { key: MAINTENANCE_FLAG_KEY } });
    return { enabled: row?.enabled ?? false, message: row?.note ?? null };
  }
}
