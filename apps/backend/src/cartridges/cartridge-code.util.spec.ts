import { describe, expect, it, vi } from 'vitest';
import { generateUniqueCartridgeCode } from './cartridge-code.util.js';
import type { PrismaService } from '../prisma/prisma.service.js';

function fakePrisma(existingCodes: string[]): PrismaService {
  return {
    cartridgeRequest: {
      findFirst: vi.fn(({ where }: { where: { code: string } }) =>
        Promise.resolve(existingCodes.includes(where.code) ? { id: 'taken' } : null),
      ),
    },
  } as unknown as PrismaService;
}

describe('generateUniqueCartridgeCode', () => {
  it('возвращает 4-значный код', async () => {
    const code = await generateUniqueCartridgeCode(fakePrisma([]));
    expect(code).toMatch(/^\d{4}$/);
  });

  it('повторяет генерацию, пока не найдёт код без активных заявок', async () => {
    const prisma = fakePrisma(['1000', '1001', '1002']);
    const code = await generateUniqueCartridgeCode(prisma);
    expect(['1000', '1001', '1002']).not.toContain(code);
    expect(prisma.cartridgeRequest.findFirst).toHaveBeenCalled();
  });
});
