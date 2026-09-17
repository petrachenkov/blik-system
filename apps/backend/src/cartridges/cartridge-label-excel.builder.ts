import ExcelJS from 'exceljs';

export interface CartridgeLabelRow {
  number: string;
  code: string;
  room: string;
  teacherFullName: string;
  createdAt: Date;
}

/**
 * Excel-файл очереди печати этикеток картриджей (см. план "Печать этикеток картриджей") —
 * Label Expert подключает его как "базу данных" (родного коннектора к Postgres в итоге не
 * стали использовать — см. фидбэк, безопаснее и проще файл, который просто перегенерируется
 * по кнопке). Поэтому это плоская таблица: строка 1 — заголовки столбцов, дальше данные,
 * без объединённых ячеек/оформления — так Label Expert надёжнее распознаёт её как источник
 * переменных полей. На саму этикетку идут code/room/createdAt — Label Expert подключает и
 * назначает поля сам; number/teacherFullName оставлены как справочные столбцы, чтобы в
 * списке строк перед печатью было видно, какая заявка какая. Столбец «QR» дублирует «Код» —
 * по фидбэку у Label Expert поле QR-кода нельзя привязать к тому же столбцу, что и обычное
 * текстовое поле, нужен отдельный столбец с тем же значением.
 */
export async function buildCartridgeLabelWorkbook(rows: CartridgeLabelRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Blik';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Этикетки');
  sheet.columns = [
    { header: 'Номер заявки', key: 'number', width: 16 },
    { header: 'Код', key: 'code', width: 10 },
    { header: 'QR', key: 'qr', width: 10 },
    { header: 'Кабинет', key: 'room', width: 24 },
    { header: 'Преподаватель', key: 'teacherFullName', width: 28 },
    { header: 'Дата', key: 'createdAt', width: 14, style: { numFmt: 'dd.mm.yyyy' } },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow({
      number: row.number,
      code: row.code,
      qr: row.code,
      room: row.room,
      teacherFullName: row.teacherFullName,
      createdAt: row.createdAt,
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
