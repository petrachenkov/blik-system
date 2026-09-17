import { describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CartridgesService } from './cartridges.service.js';
import { CartridgeRequestStatus, UserRole } from '../../generated/prisma/index.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';

const staff: AuthenticatedUser = { id: 'staff1', username: 'staff1', role: UserRole.ADMIN, isStaff: true, isMaster: false };

function build(opts: { found?: Record<string, unknown> | null; selected?: Record<string, unknown>[] } = {}) {
  const update = vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'req1', ...data }));
  const findFirst = vi.fn().mockResolvedValue(opts.found ?? null);
  const findMany = vi.fn().mockResolvedValue(opts.selected ?? []);
  const prisma = {
    cartridgeRequest: { update, findFirst, findMany },
  } as unknown as PrismaService;

  const service = new CartridgesService(prisma);
  return { service, update, findFirst, findMany };
}

describe('CartridgesService.exportLabels', () => {
  it('запрашивает только выбранные заявки в статусе NEW', async () => {
    const { service, findMany } = build({ selected: [] });
    await service.exportLabels(['a', 'b']);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['a', 'b'] }, status: CartridgeRequestStatus.NEW },
      }),
    );
  });

  it('строит Excel с заголовками и по одной строке на каждую выбранную заявку', async () => {
    const { service } = build({
      selected: [
        {
          number: 'CART-000001',
          code: '1234',
          createdAt: new Date('2026-09-01'),
          location: { building: 'Новый корпус', room: '101' },
          createdBy: { fullName: 'Иванова И.И.' },
        },
      ],
    });
    const buffer = await service.exportLabels(['req1']);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(1).getCell(1).value).toBe('Номер заявки');
    expect(sheet.getRow(1).getCell(3).value).toBe('QR');
    expect(sheet.getRow(2).getCell(2).value).toBe('1234'); // Код
    expect(sheet.getRow(2).getCell(3).value).toBe('1234'); // QR — дублирует код, отдельный столбец
    expect(sheet.getRow(2).getCell(4).value).toBe('Новый корпус, каб. 101');
    expect(sheet.rowCount).toBe(2); // заголовок + одна заявка
  });

  it('ничего не выбрано/не найдено — файл с одними заголовками, без строк данных', async () => {
    const { service } = build({ selected: [] });
    const buffer = await service.exportLabels(['missing']);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    expect(workbook.worksheets[0].rowCount).toBe(1);
  });
});

describe('CartridgesService.scanArrival', () => {
  it('отмечает прибытие заявки в статусе SENT по коду', async () => {
    const { service, update } = build({ found: { id: 'req1', code: '1234', status: CartridgeRequestStatus.SENT, arrivedAt: null } });
    const result = await service.scanArrival(staff, '1234');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'req1' },
      data: { arrivedAt: expect.any(Date), arrivedById: staff.id },
      include: expect.anything(),
    });
    expect(result.arrivedById).toBe(staff.id);
  });

  it('отказывает, если заявки с таким кодом в статусе SENT нет (опечатка/не тот статус)', async () => {
    const { service } = build({ found: null });
    await expect(service.scanArrival(staff, '9999')).rejects.toThrow(NotFoundException);
  });

  it('отказывает при повторном сканировании уже прибывшей заявки', async () => {
    const { service } = build({
      found: { id: 'req1', code: '1234', status: CartridgeRequestStatus.SENT, arrivedAt: new Date() },
    });
    await expect(service.scanArrival(staff, '1234')).rejects.toThrow(BadRequestException);
  });
});
