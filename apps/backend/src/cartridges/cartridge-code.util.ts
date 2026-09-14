import type { PrismaService } from '../prisma/prisma.service.js';
import { CartridgeRequestStatus } from '../../generated/prisma/index.js';

/** Заявка считается "активной" (код физически ещё используется), пока не заправлена/отменена. */
const ACTIVE_STATUSES: CartridgeRequestStatus[] = [
  CartridgeRequestStatus.NEW,
  CartridgeRequestStatus.COLLECTED,
  CartridgeRequestStatus.SENT,
];

const MAX_ATTEMPTS = 20;

function randomFourDigitCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * Генерирует уникальный 4-значный код. Уникальность — не через @unique в БД (см. schema.prisma),
 * а только среди заявок в активных статусах, поэтому код после заправки/отмены можно
 * использовать повторно, а пространство из 10 000 значений не исчерпывается со временем.
 */
export async function generateUniqueCartridgeCode(prisma: PrismaService): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = randomFourDigitCode();
    const existing = await prisma.cartridgeRequest.findFirst({
      where: { code, status: { in: ACTIVE_STATUSES } },
      select: { id: true },
    });
    if (!existing) return code;
  }
  throw new Error('Не удалось сгенерировать уникальный код картриджа — слишком много активных заявок');
}
