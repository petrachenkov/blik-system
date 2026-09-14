import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeatureFlagsService } from './feature-flags.service.js';
import { FEATURE_FLAGS, MAINTENANCE_FLAG_KEY } from './feature-flags.js';

function makePrismaMock(rows: { key: string; enabled: boolean; note?: string | null }[]) {
  const store = new Map(rows.map((r) => [r.key, { ...r, note: r.note ?? null, updatedAt: new Date() }]));
  return {
    systemFlag: {
      findMany: vi.fn(async () => [...store.values()]),
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => store.get(where.key) ?? null),
      upsert: vi.fn(async ({ where, update, create }: any) => {
        const existing = store.get(where.key);
        const next = existing ? { ...existing, ...update } : { ...create, updatedAt: new Date() };
        store.set(where.key, next);
        return next;
      }),
    },
    _store: store,
  };
}

describe('FeatureFlagsService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: FeatureFlagsService;

  beforeEach(() => {
    prisma = makePrismaMock([
      { key: FEATURE_FLAGS.WALLBOARD, enabled: true },
      { key: FEATURE_FLAGS.WEB_PUSH, enabled: false },
      { key: MAINTENANCE_FLAG_KEY, enabled: false, note: null },
    ]);
    service = new FeatureFlagsService(prisma as never);
  });

  it('возвращает состояние флага; неизвестный ключ считается включённым', async () => {
    expect(await service.isEnabled(FEATURE_FLAGS.WALLBOARD)).toBe(true);
    expect(await service.isEnabled(FEATURE_FLAGS.WEB_PUSH)).toBe(false);
    expect(await service.isEnabled('never_seeded')).toBe(true);
  });

  it('кэширует чтение из БД и сбрасывает кэш после set', async () => {
    await service.isEnabled(FEATURE_FLAGS.WALLBOARD);
    await service.isEnabled(FEATURE_FLAGS.WEB_PUSH);
    expect(prisma.systemFlag.findMany).toHaveBeenCalledTimes(1); // второй вызов — из кэша

    await service.set(FEATURE_FLAGS.WEB_PUSH, true, null, 'user-1');
    expect(await service.isEnabled(FEATURE_FLAGS.WEB_PUSH)).toBe(true); // кэш сброшен, перечитали
    expect(prisma.systemFlag.findMany).toHaveBeenCalledTimes(2);
  });

  it('getMaintenance читает enabled/note из строки maintenance_mode', async () => {
    expect(await service.getMaintenance()).toEqual({ enabled: false, message: null });
    await service.set(MAINTENANCE_FLAG_KEY, true, 'Работы до 18:00', 'user-1');
    expect(await service.getMaintenance()).toEqual({ enabled: true, message: 'Работы до 18:00' });
  });
});
