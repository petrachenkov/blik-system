import { describe, expect, it } from 'vitest';
import { isWithinQuietHours } from './quiet-hours.js';

function at(hh: number, mm: number): Date {
  return new Date(2026, 0, 1, hh, mm);
}

describe('isWithinQuietHours', () => {
  it('фича выключена, если хотя бы одна граница не задана', () => {
    expect(isWithinQuietHours(at(23, 0), undefined, '08:00')).toBe(false);
    expect(isWithinQuietHours(at(23, 0), '22:00', undefined)).toBe(false);
  });

  it('обычное окно в пределах суток (01:00–06:00)', () => {
    expect(isWithinQuietHours(at(3, 0), '01:00', '06:00')).toBe(true);
    expect(isWithinQuietHours(at(0, 30), '01:00', '06:00')).toBe(false);
    expect(isWithinQuietHours(at(6, 0), '01:00', '06:00')).toBe(false); // конец не включается
  });

  it('окно через полночь (22:00–08:00)', () => {
    expect(isWithinQuietHours(at(23, 0), '22:00', '08:00')).toBe(true);
    expect(isWithinQuietHours(at(2, 0), '22:00', '08:00')).toBe(true);
    expect(isWithinQuietHours(at(12, 0), '22:00', '08:00')).toBe(false);
    expect(isWithinQuietHours(at(22, 0), '22:00', '08:00')).toBe(true); // начало включается
    expect(isWithinQuietHours(at(8, 0), '22:00', '08:00')).toBe(false); // конец не включается
  });

  it('нулевое окно (start === end) — тихих часов фактически нет', () => {
    expect(isWithinQuietHours(at(10, 0), '10:00', '10:00')).toBe(false);
  });
});
