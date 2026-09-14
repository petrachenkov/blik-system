import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildCartridgeReportWorkbook } from './excel-report.builder.js';

describe('buildCartridgeReportWorkbook', () => {
  it('строит книгу с портретной ориентацией и всеми 4 столбцами', async () => {
    const buffer = await buildCartridgeReportWorkbook({
      reportNumber: 'REPORT-000001',
      generatedAt: new Date('2026-09-07T10:00:00Z'),
      rows: [
        { code: '4821', room: 'Корпус А, каб. 204', teacherFullName: 'Иванова Мария Петровна' },
        { code: '3310', room: 'Корпус Б, каб. 101', teacherFullName: 'Петров Сергей Иванович' },
      ],
    });

    expect(buffer.byteLength).toBeGreaterThan(0);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];

    expect(sheet.pageSetup.orientation).toBe('portrait');

    const headerRow = sheet.getRow(4).values as unknown[];
    expect(headerRow.slice(1)).toEqual(['№ картриджа', 'Кабинет', 'ФИО преподавателя', 'Подпись']);

    // 2 заголовочные строки + пустая + строка заголовков таблицы + 2 строки данных
    expect(sheet.rowCount).toBe(6);

    const firstDataRow = sheet.getRow(5).values as unknown[];
    expect(firstDataRow.slice(1, 4)).toEqual(['4821', 'Корпус А, каб. 204', 'Иванова Мария Петровна']);
  });
});
