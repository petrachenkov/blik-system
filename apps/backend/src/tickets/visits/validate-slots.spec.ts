import { describe, expect, it } from 'vitest';
import { validateVisitSlots } from './validate-slots.js';

const NOW = new Date('2026-09-10T12:00:00.000Z').getTime();
const future = (h: number) => new Date(NOW + h * 3600_000).toISOString();

describe('validateVisitSlots', () => {
  it('принимает 1–3 корректных окна в будущем', () => {
    const parsed = validateVisitSlots(
      [
        { start: future(2), end: future(3) },
        { start: future(26), end: future(28) },
      ],
      NOW,
    );
    expect(parsed).toHaveLength(2);
    expect(parsed[0].start).toBeInstanceOf(Date);
  });

  it('отклоняет пустой список и более 3 окон', () => {
    expect(() => validateVisitSlots([], NOW)).toThrow(/от 1 до 3/);
    expect(() =>
      validateVisitSlots(
        [1, 2, 3, 4].map(() => ({ start: future(2), end: future(3) })),
        NOW,
      ),
    ).toThrow(/от 1 до 3/);
  });

  it('отклоняет окно, где начало не раньше конца', () => {
    expect(() => validateVisitSlots([{ start: future(3), end: future(2) }], NOW)).toThrow(/раньше конца/);
    expect(() => validateVisitSlots([{ start: future(2), end: future(2) }], NOW)).toThrow(/раньше конца/);
  });

  it('отклоняет окно в прошлом', () => {
    expect(() => validateVisitSlots([{ start: future(-1), end: future(1) }], NOW)).toThrow(/в прошлом/);
  });

  it('отклоняет некорректную дату', () => {
    expect(() => validateVisitSlots([{ start: 'не дата', end: future(2) }], NOW)).toThrow(/Некорректная дата/);
  });
});
