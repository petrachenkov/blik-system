import * as argon2 from 'argon2';
import { PrismaClient, UserRole, UserSource } from '../../generated/prisma/index.js';
import { ALL_FLAG_KEYS, MAINTENANCE_FLAG_KEY } from '../system/feature-flags.js';

/**
 * Идемпотентный сид master-аккаунта (breakglass-суперпользователь, source = LOCAL).
 * Запуск: npm run prisma:seed. Значения берутся из env: MASTER_USERNAME/MASTER_PASSWORD/MASTER_FULL_NAME.
 */
async function main() {
  const username = process.env.MASTER_USERNAME;
  const password = process.env.MASTER_PASSWORD;
  const fullName = process.env.MASTER_FULL_NAME ?? 'Master Administrator';

  if (!username || !password) {
    throw new Error('MASTER_USERNAME и MASTER_PASSWORD должны быть заданы в окружении перед сидом');
  }
  if (password.length < 8) {
    throw new Error('MASTER_PASSWORD должен быть не короче 8 символов');
  }

  const prisma = new PrismaClient();
  try {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const master = await prisma.user.upsert({
      where: { username },
      update: {
        fullName,
        passwordHash,
        role: UserRole.ADMIN,
        source: UserSource.LOCAL,
        isStaff: true,
        isActive: true,
        isMaster: true,
      },
      create: {
        username,
        fullName,
        passwordHash,
        role: UserRole.ADMIN,
        source: UserSource.LOCAL,
        isStaff: true,
        isActive: true,
        isMaster: true,
      },
    });

    console.log(`Master-аккаунт готов: ${master.username} (роль ${master.role})`);

    // Дефолтные SLA-сроки по приоритетам — редактируются позже через admin UI.
    const defaults: Array<{ priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; responseMinutes: number; resolutionMinutes: number }> = [
      { priority: 'CRITICAL', responseMinutes: 30, resolutionMinutes: 4 * 60 },
      { priority: 'HIGH', responseMinutes: 2 * 60, resolutionMinutes: 24 * 60 },
      { priority: 'MEDIUM', responseMinutes: 8 * 60, resolutionMinutes: 3 * 24 * 60 },
      { priority: 'LOW', responseMinutes: 24 * 60, resolutionMinutes: 7 * 24 * 60 },
    ];

    for (const cfg of defaults) {
      await prisma.slaConfig.upsert({
        where: { priority: cfg.priority },
        update: {},
        create: cfg,
      });
    }
    console.log('Дефолтные SLA-настройки созданы (если ещё не существовали)');

    // Флаги функциональности (см. план "Флаги функциональности"): все фичи включены,
    // режим обслуживания выключен. Идемпотентно — не трогает уже изменённые администратором.
    for (const key of ALL_FLAG_KEYS) {
      await prisma.systemFlag.upsert({
        where: { key },
        update: {},
        create: { key, enabled: key !== MAINTENANCE_FLAG_KEY },
      });
    }
    console.log('Флаги функциональности инициализированы (если ещё не существовали)');

    // Тестовые аккаунты для ручной проверки ролей — только когда явно включено флагом.
    // НЕ включать в продакшене (SEED_TEST_ACCOUNTS не должен быть задан в infra/.env для прод-окружения).
    if (process.env.SEED_TEST_ACCOUNTS === 'true') {
      const testAccounts: Array<{ username: string; fullName: string; role: UserRole }> = [
        { username: 'test_admin1', fullName: 'Тест Сисадмин 1', role: UserRole.ADMIN },
        { username: 'test_applicant1', fullName: 'Тест Преподаватель 1', role: UserRole.USER },
      ];
      const testPasswordHash = await argon2.hash('TestPass123', { type: argon2.argon2id });

      for (const acc of testAccounts) {
        await prisma.user.upsert({
          where: { username: acc.username },
          update: { fullName: acc.fullName, role: acc.role, passwordHash: testPasswordHash, isActive: true, isStaff: true },
          create: {
            username: acc.username,
            fullName: acc.fullName,
            role: acc.role,
            passwordHash: testPasswordHash,
            source: UserSource.LOCAL,
            isStaff: true,
            isActive: true,
          },
        });
      }
      console.log('Тестовые аккаунты созданы: test_admin1 / test_applicant1 (пароль: TestPass123)');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
