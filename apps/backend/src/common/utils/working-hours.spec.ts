import { describe, expect, it } from 'vitest';
import {
  checkSlotWithinWorkingHours,
  isWithinWorkingHours,
  isoWeekday,
  localDateKey,
  type WorkingHours,
} from './working-hours.js';

const WH: WorkingHours = {
  workdayStart: '09:00',
  workdayEnd: '18:00',
  workingDays: [1, 2, 3, 4, 5],
  holidays: ['2026-09-16'],
};

// Локальное время — конструктор new Date(y, m, d, h) не зависит от таймзоны машины.
const at = (y: number, mon: number, d: number, h: number, min = 0) => new Date(y, mon - 1, d, h, min);

describe('isoWeekday', () => {
  it('воскресенье = 7, понедельник = 1', () => {
    expect(isoWeekday(at(2026, 9, 13, 12))).toBe(7); // 13 сен 2026 — Вс
    expect(isoWeekday(at(2026, 9, 14, 12))).toBe(1); // 14 сен 2026 — Пн
  });
});

describe('localDateKey', () => {
  it('форматирует YYYY-MM-DD по локальному времени', () => {
    expect(localDateKey(at(2026, 9, 7, 23))).toBe('2026-09-07');
  });
});

describe('isWithinWorkingHours', () => {
  it('рабочий будний день в окне', () => {
    expect(isWithinWorkingHours(at(2026, 9, 14, 10), WH)).toBe(true);
  });
  it('вне окна по времени', () => {
    expect(isWithinWorkingHours(at(2026, 9, 14, 20), WH)).toBe(false);
  });
  it('выходной день недели', () => {
    expect(isWithinWorkingHours(at(2026, 9, 13, 12), WH)).toBe(false);
  });
  it('нерабочая дата из holidays', () => {
    expect(isWithinWorkingHours(at(2026, 9, 16, 12), WH)).toBe(false);
  });
});

describe('checkSlotWithinWorkingHours', () => {
  it('корректное окно — null', () => {
    expect(checkSlotWithinWorkingHours(at(2026, 9, 14, 10), at(2026, 9, 14, 11), WH)).toBeNull();
  });
  it('окно за пределами рабочего дня', () => {
    expect(checkSlotWithinWorkingHours(at(2026, 9, 14, 17), at(2026, 9, 14, 19), WH)).toMatch(/рабочих часов/);
  });
  it('окно в выходной', () => {
    expect(checkSlotWithinWorkingHours(at(2026, 9, 12, 10), at(2026, 9, 12, 11), WH)).toMatch(/нерабочий/);
  });
  it('окно в праздник', () => {
    expect(checkSlotWithinWorkingHours(at(2026, 9, 16, 10), at(2026, 9, 16, 11), WH)).toMatch(/нерабочая/);
  });
  it('окно, переходящее на следующий день', () => {
    expect(checkSlotWithinWorkingHours(at(2026, 9, 14, 10), at(2026, 9, 15, 11), WH)).toMatch(/один день/);
  });
});
