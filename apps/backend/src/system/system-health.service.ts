import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { statfs } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';
import { LdapService } from '../auth/ldap/ldap.service.js';
import { WebPushChannelProvider } from '../notifications/channels/web-push-channel.provider.js';
import type { Env } from '../config/env.schema.js';

type ComponentStatus = 'ok' | 'warn' | 'down' | 'disabled';

const TIMEOUT_MS = 5000;

/** Гонка с таймаутом, который РЕЗОЛВИТСЯ значением-заглушкой (не reject) — health-чек сам не должен падать. */
function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((res) => setTimeout(() => res(fallback), TIMEOUT_MS)),
  ]);
}

@Injectable()
export class SystemHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ldap: LdapService,
    private readonly webPush: WebPushChannelProvider,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async check() {
    const [db, ldap, webPush, disk] = await Promise.all([
      this.checkDb(),
      this.checkLdap(),
      this.checkWebPush(),
      this.checkDisk(),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      components: { db, ldap, webPush, disk, max: { status: 'disabled' as ComponentStatus } },
    };
  }

  private async checkDb(): Promise<{ status: ComponentStatus; latencyMs: number; error?: string }> {
    const startedAt = Date.now();
    const ok = await withTimeout(
      this.prisma.$queryRaw`SELECT 1`.then(() => true),
      false,
    );
    return ok
      ? { status: 'ok', latencyMs: Date.now() - startedAt }
      : { status: 'down', latencyMs: Date.now() - startedAt, error: 'нет ответа от базы данных' };
  }

  private async checkLdap(): Promise<{ status: ComponentStatus; latencyMs: number; error?: string }> {
    const result = await withTimeout(this.ldap.checkConnection(), { ok: false, latencyMs: TIMEOUT_MS, error: 'превышено время ожидания' });
    return result.ok
      ? { status: 'ok', latencyMs: result.latencyMs }
      : { status: 'down', latencyMs: result.latencyMs, error: result.error };
  }

  private async checkWebPush(): Promise<{ status: ComponentStatus; configured: boolean; subscriptions: number }> {
    if (!this.webPush.isVapidConfigured) {
      return { status: 'disabled', configured: false, subscriptions: 0 };
    }
    const subscriptions = await this.prisma.webPushSubscription.count();
    return { status: 'ok', configured: true, subscriptions };
  }

  private async checkDisk(): Promise<{ status: ComponentStatus; freeBytes: number; totalBytes: number; usedPercent: number; error?: string }> {
    try {
      const dir = resolve(this.config.get('UPLOADS_DIR', { infer: true }));
      const stats = await statfs(dir);
      const totalBytes = stats.blocks * stats.bsize;
      const freeBytes = stats.bavail * stats.bsize;
      const usedPercent = totalBytes > 0 ? Math.round(((totalBytes - freeBytes) / totalBytes) * 100) : 0;
      const freeRatio = totalBytes > 0 ? freeBytes / totalBytes : 1;
      const status: ComponentStatus =
        freeRatio < 0.01 ? 'down' : freeRatio < 0.1 || freeBytes < 1024 ** 3 ? 'warn' : 'ok';
      return { status, freeBytes, totalBytes, usedPercent };
    } catch (error) {
      return { status: 'down', freeBytes: 0, totalBytes: 0, usedPercent: 0, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
