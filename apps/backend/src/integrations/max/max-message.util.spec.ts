import { describe, expect, it } from 'vitest';
import { formatMaxMessage } from './max-message.util.js';

describe('MAX message formatting', () => {
  it('escapes user HTML and preserves the heading', () => {
    expect(formatMaxMessage('<b>Заявка</b>', 'A & B <script>')).toBe('<b>&lt;b&gt;Заявка&lt;/b&gt;</b>\n\nA &amp; B &lt;script&gt;');
  });
  it('does not truncate inside an HTML entity or Unicode character', () => {
    const text = formatMaxMessage('Заявка', '<😀&'.repeat(2000));
    expect(text.length).toBeLessThanOrEqual(4000);
    expect(text).not.toMatch(/&(?:a|am|amp|l|lt|g|gt)?$/);
    expect(text).not.toMatch(/[\uD800-\uDBFF]$/);
  });
});
