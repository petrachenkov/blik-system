import ExcelJS from 'exceljs';
import { ROLE_LABELS_RU } from '../common/ru-labels.js';
import type { AssigneeStatsRow } from './tickets.service.js';

function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '—';
  const totalMinutes = Math.round(minutes);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins} мин`;
  if (hours < 24) return `${hours} ч ${mins} мин`;
  return `${Math.floor(hours / 24)} дн ${hours % 24} ч`;
}

const HEADERS = [
  'Исполнитель',
  'Роль',
  'Открыто сейчас',
  'Всего назначено',
  'Решено/закрыто',
  'Отклонено',
  'Просрочка реакции',
  'Просрочка решения',
  'Среднее время реакции',
  'Среднее время решения',
  'Средняя оценка',
] as const;

/**
 * Excel-версия «Статистики исполнителей» за выбранный период (см. план "Отчёт по статистике
 * за период") — те же данные и итоговая строка, что на экране AssigneeStatsPage, но документом,
 * который можно сохранить/распечатать/передать дальше. Период в шапке — null-границы значат
 * "весь период" (см. TicketsService.getAssigneeStats).
 */
export async function buildAssigneeStatsWorkbook(params: {
  generatedAt: Date;
  from: Date | null;
  to: Date | null;
  rows: AssigneeStatsRow[];
}): Promise<Buffer> {
  const { rows } = params;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Blik';
  workbook.created = params.generatedAt;

  const sheet = workbook.addWorksheet('Статистика', {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const colCount = HEADERS.length;
  const lastColLetter = String.fromCharCode('A'.charCodeAt(0) + colCount - 1);

  sheet.mergeCells(`A1:${lastColLetter}1`);
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'Статистика исполнителей';
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center' };

  const periodText =
    params.from && params.to
      ? `Период: ${params.from.toLocaleDateString('ru-RU')} — ${params.to.toLocaleDateString('ru-RU')}`
      : 'Период: весь период';
  sheet.mergeCells(`A2:${lastColLetter}2`);
  const periodCell = sheet.getCell('A2');
  periodCell.value = `${periodText}. Сформировано: ${params.generatedAt.toLocaleString('ru-RU')}`;
  periodCell.font = { italic: true, size: 10 };
  periodCell.alignment = { horizontal: 'center' };

  sheet.addRow([]);

  sheet.columns = [
    { key: 'fullName', width: 26 },
    { key: 'role', width: 14 },
    { key: 'openCount', width: 15 },
    { key: 'totalAssignedCount', width: 16 },
    { key: 'resolvedCount', width: 16 },
    { key: 'rejectedCount', width: 12 },
    { key: 'responseBreachedCount', width: 16 },
    { key: 'resolutionBreachedCount', width: 16 },
    { key: 'avgResponseMinutes', width: 18 },
    { key: 'avgResolutionMinutes', width: 18 },
    { key: 'avgRating', width: 14 },
  ];

  const headerRow = sheet.addRow([...HEADERS]);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  headerRow.eachCell((cell) => {
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
  });

  for (const row of rows) {
    const dataRow = sheet.addRow([
      row.fullName,
      ROLE_LABELS_RU[row.role],
      row.openCount,
      row.totalAssignedCount,
      row.resolvedCount,
      row.rejectedCount,
      row.responseBreachedCount,
      row.resolutionBreachedCount,
      formatMinutes(row.avgResponseMinutes),
      formatMinutes(row.avgResolutionMinutes),
      row.avgRating === null ? '—' : row.avgRating.toFixed(1),
    ]);
    dataRow.eachCell((cell) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  }

  const sum = (f: (r: AssigneeStatsRow) => number) => rows.reduce((acc, r) => acc + f(r), 0);
  const avg = (f: (r: AssigneeStatsRow) => number | null) => {
    const vals = rows.map(f).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const totalRow = sheet.addRow([
    'Итого / в среднем',
    '',
    sum((r) => r.openCount),
    sum((r) => r.totalAssignedCount),
    sum((r) => r.resolvedCount),
    sum((r) => r.rejectedCount),
    sum((r) => r.responseBreachedCount),
    sum((r) => r.resolutionBreachedCount),
    formatMinutes(avg((r) => r.avgResponseMinutes)),
    formatMinutes(avg((r) => r.avgResolutionMinutes)),
    (() => {
      const a = avg((r) => r.avgRating);
      return a === null ? '—' : a.toFixed(1);
    })(),
  ]);
  totalRow.font = { bold: true };
  totalRow.eachCell((cell) => {
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
