import { describe, expect, it } from 'vitest';
import { PDFParse } from 'pdf-parse';
import { buildMyTicketsReportPdf } from './ticket-report-pdf.builder.js';
import { HistoryAction, TicketStatus, TicketPriority, UserRole } from '../../generated/prisma/index.js';

function pdfToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

describe('buildMyTicketsReportPdf', () => {
  it('строит PDF-документ без заявок', async () => {
    const doc = buildMyTicketsReportPdf({ teacherFullName: 'Иванова Мария Петровна', generatedAt: new Date(), tickets: [] });
    const buffer = await pdfToBuffer(doc);
    expect(buffer.byteLength).toBeGreaterThan(0);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('включает кириллицу, полную хронологию и переписку по заявке', async () => {
    const doc = buildMyTicketsReportPdf({
      teacherFullName: 'Иванова Мария Петровна',
      generatedAt: new Date('2026-09-07T10:00:00Z'),
      tickets: [
        {
          number: 'BLIK-000001',
          description: 'Не работает проектор в кабинете',
          status: TicketStatus.RESOLVED,
          priority: TicketPriority.HIGH,
          categoryName: 'Проектор',
          locationLabel: 'Корпус А, каб. 101',
          createdAt: new Date('2026-09-01T09:00:00Z'),
          closedAt: new Date('2026-09-02T09:00:00Z'),
          history: [
            {
              createdAt: new Date('2026-09-01T09:05:00Z'),
              action: HistoryAction.CREATED,
              fromValue: null,
              toValue: null,
              actorFullName: 'Иванова Мария Петровна',
            },
            {
              createdAt: new Date('2026-09-01T10:00:00Z'),
              action: HistoryAction.ASSIGNED,
              fromValue: null,
              toValue: 'Сидоров Пётр Иванович',
              actorFullName: 'Master Administrator',
            },
          ],
          comments: [
            {
              createdAt: new Date('2026-09-01T11:00:00Z'),
              body: 'Проверяю проводку проектора',
              authorFullName: 'Сидоров Пётр Иванович',
              authorRole: UserRole.ADMIN,
              attachmentFilenames: [],
            },
          ],
        },
      ],
    });

    const buffer = await pdfToBuffer(doc);
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      expect(result.text).toContain('Иванова Мария Петровна');
      expect(result.text).toContain('BLIK-000001');
      expect(result.text).toContain('Не работает проектор в кабинете');
      expect(result.text).toContain('Заявка создана');
      expect(result.text).toContain('Сидоров Пётр Иванович');
      expect(result.text).toContain('Проверяю проводку проектора');
      // Приоритет — рабочая метрика сисадминов, в справке для преподавателя не показывается
      // (см. фидбэк: приоритет/SLA скрыты от преподавателей во всём приложении).
      expect(result.text).not.toContain('Высокий');
    } finally {
      await parser.destroy();
    }
  });
});
