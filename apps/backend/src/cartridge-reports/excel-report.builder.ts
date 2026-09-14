import ExcelJS from 'exceljs';

export interface CartridgeReportRow {
  code: string;
  room: string;
  teacherFullName: string;
}

/**
 * Строит Excel-книгу отчёта на заправку картриджей — вертикальная (портретная) ориентация,
 * все 4 столбца должны влезать на печатную страницу A4 (см. план): код картриджа, кабинет,
 * ФИО преподавателя и пустая ячейка под подпись (заполняется от руки при выдаче/возврате).
 */
export async function buildCartridgeReportWorkbook(params: {
  reportNumber: string;
  generatedAt: Date;
  rows: CartridgeReportRow[];
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Blik';
  workbook.created = params.generatedAt;

  const sheet = workbook.addWorksheet('Отчёт', {
    pageSetup: {
      orientation: 'portrait',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
  });

  sheet.columns = [
    { header: '№ картриджа', key: 'code', width: 14 },
    { header: 'Кабинет', key: 'room', width: 20 },
    { header: 'ФИО преподавателя', key: 'teacherFullName', width: 34 },
    { header: 'Подпись', key: 'signature', width: 18 },
  ];

  sheet.mergeCells('A1:D1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `Отчёт о заправке картриджей № ${params.reportNumber}`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center' };

  sheet.mergeCells('A2:D2');
  const dateCell = sheet.getCell('A2');
  dateCell.value = `Дата формирования: ${params.generatedAt.toLocaleString('ru-RU')}`;
  dateCell.font = { italic: true, size: 10 };
  dateCell.alignment = { horizontal: 'center' };

  sheet.addRow([]);

  const headerRow = sheet.addRow(['№ картриджа', 'Кабинет', 'ФИО преподавателя', 'Подпись']);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.eachCell((cell) => {
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
  });

  for (const row of params.rows) {
    const dataRow = sheet.addRow([row.code, row.room, row.teacherFullName, '']);
    dataRow.eachCell((cell, colNumber) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      if (colNumber === 1) cell.alignment = { horizontal: 'center' };
      if (colNumber === 4) dataRow.height = 26; // место для подписи от руки
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
