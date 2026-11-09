import { describe, expect, it } from 'vitest';
import { NotificationType, TicketStatus } from '../../../generated/prisma/index.js';
import { formatMaxMessage } from './max-message.util.js';

describe('MAX message formatting', () => {
  it('escapes user HTML and preserves the heading', () => {
    expect(formatMaxMessage({
      type: NotificationType.TICKET_COMMENTED, title: '<b>Заявка</b>', body: 'A & B <script>', payload: null,
    })).toBe('💬 <b>&lt;b&gt;Заявка&lt;/b&gt;</b>\n\nA &amp; B &lt;script&gt;');
  });

  it.each([
    [TicketStatus.RESOLVED, '✅'],
    [TicketStatus.CLOSED, '🔒'],
    [TicketStatus.REJECTED, '⛔'],
    [TicketStatus.REOPENED, '↩️'],
    [null, '🔄'],
  ])('renders the status icon for %s', (ticketStatus, icon) => {
    const text = formatMaxMessage({
      type: NotificationType.TICKET_STATUS_CHANGED, title: 'Заявка Б-42', body: 'Обновлён статус',
      payload: ticketStatus ? { ticketStatus } : null,
    });
    expect(text.startsWith(`${icon} <b>Заявка Б-42</b>`)).toBe(true);
  });

  it('does not truncate inside an HTML entity or Unicode character', () => {
    const text = formatMaxMessage({
      type: NotificationType.TICKET_CREATED, title: 'Заявка', body: '<😀&'.repeat(2000), payload: null,
    });
    expect(text.length).toBeLessThanOrEqual(4000);
    expect(text).not.toMatch(/&(?:a|am|amp|l|lt|g|gt)?$/);
    expect(text).not.toMatch(/[\uD800-\uDBFF]$/);
  });
});
