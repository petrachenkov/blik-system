import PDFDocument from 'pdfkit';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { HISTORY_ACTION_LABELS_RU, ROLE_LABELS_RU, STATUS_LABELS_RU } from '../common/ru-labels.js';
import type { HistoryAction, TicketPriority, TicketStatus, UserRole } from '../../generated/prisma/index.js';

// PDFKit не поддерживает кириллицу встроенными Base14-шрифтами — встраиваем DejaVu Sans
// (пакет отдаёт именно .ttf-файлы, а не web-форматы woff/woff2, см. план).
const require = createRequire(import.meta.url);
const FONTS_DIR = join(dirname(require.resolve('dejavu-fonts-ttf/package.json')), 'ttf');
const FONT_REGULAR = join(FONTS_DIR, 'DejaVuSans.ttf');
const FONT_BOLD = join(FONTS_DIR, 'DejaVuSans-Bold.ttf');

export interface TicketReportHistoryRow {
  createdAt: Date;
  action: HistoryAction;
  fromValue: string | null;
  toValue: string | null;
  actorFullName: string | null;
}

export interface TicketReportCommentRow {
  createdAt: Date;
  body: string;
  authorFullName: string | null;
  authorRole: UserRole | null;
  attachmentFilenames: string[];
}

export interface TicketReportRow {
  number: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority | null;
  categoryName: string | null;
  locationLabel: string;
  createdAt: Date;
  closedAt: Date | null;
  history: TicketReportHistoryRow[];
  comments: TicketReportCommentRow[];
}

/** Общий каркас документа: создание + регистрация кириллического шрифта (см. выше). */
function createReportPdfDoc(): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.registerFont('regular', FONT_REGULAR);
  doc.registerFont('bold', FONT_BOLD);
  return doc;
}

/**
 * Полноценное досье по одной заявке: описание + вся хронология + вся переписка (не сводная
 * строка — см. план). Вложения не встраиваются файлами, только перечисляются по имени.
 * Общая для сводной справки по всем заявкам преподавателя и для справки по одной заявке.
 */
function renderTicketSection(doc: PDFKit.PDFDocument, ticket: TicketReportRow): void {
  doc.moveDown(0.6);
  doc.font('bold').fontSize(13).text(`Заявка ${ticket.number}`);
  doc.font('regular').fontSize(10);
  doc.text(`Локация: ${ticket.locationLabel}`);
  // Приоритет намеренно не выводим — это рабочая метрика сисадминов, а справка предназначена
  // преподавателю (см. фидбэк: приоритет/SLA скрыты от преподавателей и в самом приложении).
  doc.text(`Категория: ${ticket.categoryName ?? 'не задана'}`);
  doc.text(`Статус: ${STATUS_LABELS_RU[ticket.status]}`);
  doc.text(
    `Создана: ${ticket.createdAt.toLocaleString('ru-RU')}` +
      (ticket.closedAt ? ` · Закрыта: ${ticket.closedAt.toLocaleString('ru-RU')}` : ''),
  );

  doc.moveDown(0.3);
  doc.font('bold').fontSize(11).text('Описание');
  doc.font('regular').fontSize(10).text(ticket.description);

  doc.moveDown(0.3);
  doc.font('bold').fontSize(11).text('Хронология');
  doc.font('regular').fontSize(10);
  if (ticket.history.length === 0) {
    doc.text('— нет записей —');
  }
  for (const h of ticket.history) {
    const label = HISTORY_ACTION_LABELS_RU[h.action] ?? h.action;
    const change = h.fromValue && h.toValue ? `: ${h.fromValue} → ${h.toValue}` : h.toValue ? `: ${h.toValue}` : '';
    doc.text(`${h.createdAt.toLocaleString('ru-RU')} — ${label}${change}${h.actorFullName ? ` (${h.actorFullName})` : ''}`);
  }

  doc.moveDown(0.3);
  doc.font('bold').fontSize(11).text('Переписка');
  doc.font('regular').fontSize(10);
  if (ticket.comments.length === 0) {
    doc.text('— нет сообщений —');
  }
  for (const c of ticket.comments) {
    const authorLabel = c.authorFullName
      ? `${c.authorFullName}${c.authorRole ? ` (${ROLE_LABELS_RU[c.authorRole]})` : ''}`
      : 'Система';
    doc.font('bold').fontSize(10).text(`${c.createdAt.toLocaleString('ru-RU')} — ${authorLabel}`);
    doc.font('regular').fontSize(10).text(c.body);
    if (c.attachmentFilenames.length > 0) {
      doc.fillColor('#555').text(`Вложения (${c.attachmentFilenames.length}): ${c.attachmentFilenames.join(', ')}`);
      doc.fillColor('#000');
    }
  }

  doc.moveDown(0.5);
  const dividerY = doc.y;
  doc
    .moveTo(doc.page.margins.left, dividerY)
    .lineTo(doc.page.width - doc.page.margins.right, dividerY)
    .strokeColor('#cccccc')
    .stroke();
}

/**
 * Полноценное досье по каждой заявке преподавателя: описание + вся хронология + вся переписка
 * (не сводная таблица "по строке на заявку" — см. план). Вложения не встраиваются файлами,
 * только перечисляются по имени.
 */
export function buildMyTicketsReportPdf(params: {
  teacherFullName: string;
  generatedAt: Date;
  tickets: TicketReportRow[];
}): PDFKit.PDFDocument {
  const doc = createReportPdfDoc();

  doc.font('bold').fontSize(16).text(`Справка о заявках, поданных: ${params.teacherFullName}`);
  doc.font('regular').fontSize(10).fillColor('#555').text(`Сформировано: ${params.generatedAt.toLocaleString('ru-RU')}`);
  doc.fillColor('#000');
  doc.moveDown();

  if (params.tickets.length === 0) {
    doc.font('regular').fontSize(11).text('Заявок не найдено.');
  }

  for (const ticket of params.tickets) {
    renderTicketSection(doc, ticket);
  }

  return doc;
}

/** Справка по одной конкретной заявке (см. план "Экспорт заявки в PDF") — тот же формат
 * секции, что и в сводной справке выше, но заголовок документа — номер заявки, а не имя. */
export function buildSingleTicketPdf(params: {
  teacherFullName: string;
  generatedAt: Date;
  ticket: TicketReportRow;
}): PDFKit.PDFDocument {
  const doc = createReportPdfDoc();

  doc.font('bold').fontSize(16).text(`Справка по заявке ${params.ticket.number}`);
  doc
    .font('regular')
    .fontSize(10)
    .fillColor('#555')
    .text(`Заявитель: ${params.teacherFullName} · Сформировано: ${params.generatedAt.toLocaleString('ru-RU')}`);
  doc.fillColor('#000');
  doc.moveDown();

  renderTicketSection(doc, params.ticket);

  return doc;
}
