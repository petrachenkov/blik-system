/**
 * Рабочие часы для планирования визитов системного администратора (см. план «Доработка календаря
 * визитов»). Окно визита допустимо, только если целиком укладывается в рабочий день:
 * дата не в списке нерабочих (holidays), день недели входит в workingDays (1=Пн … 7=Вс, ISO),
 * и время [start, end) не выходит за [workdayStart, workdayEnd). Рабочий день не переходит
 * через полночь, поэтому окно тоже не должно (проверяется отдельно).
 *
 * Все сравнения — по серверному локальному времени, как в quiet-hours.ts.
 */
export interface WorkingHours {
  workdayStart: string; // "HH:mm"
  workdayEnd: string; // "HH:mm"
  workingDays: number[]; // 1..7 (ISO, 1=Пн)
  holidays: string[]; // "YYYY-MM-DD"
}

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  workdayStart: '08:00',
  workdayEnd: '19:00',
  workingDays: [1, 2, 3, 4, 5],
  holidays: [],
};

function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

/** ISO-номер дня недели: Пн=1 … Вс=7 (в отличие от Date.getDay(), где Вс=0). */
export function isoWeekday(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

/** Локальная дата в формате "YYYY-MM-DD". */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Момент внутри рабочего времени (день недели рабочий, не праздник, время в окне дня). */
export function isWithinWorkingHours(moment: Date, wh: WorkingHours): boolean {
  if (wh.holidays.includes(localDateKey(moment))) return false;
  if (!wh.workingDays.includes(isoWeekday(moment))) return false;
  const minutes = moment.getHours() * 60 + moment.getMinutes();
  return minutes >= toMinutes(wh.workdayStart) && minutes <= toMinutes(wh.workdayEnd);
}

/**
 * Окно визита [start, end] целиком в рабочем времени: обе границы в один рабочий день,
 * день рабочий и не праздник, время не выходит за окно дня. Возвращает текст ошибки или null.
 */
export function checkSlotWithinWorkingHours(start: Date, end: Date, wh: WorkingHours): string | null {
  if (localDateKey(start) !== localDateKey(end)) {
    return 'Окно визита должно начинаться и заканчиваться в один день';
  }
  if (wh.holidays.includes(localDateKey(start))) {
    return `Дата ${localDateKey(start)} отмечена как нерабочая`;
  }
  if (!wh.workingDays.includes(isoWeekday(start))) {
    return 'Этот день недели нерабочий';
  }
  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMin = end.getHours() * 60 + end.getMinutes();
  const dayStart = toMinutes(wh.workdayStart);
  const dayEnd = toMinutes(wh.workdayEnd);
  if (startMin < dayStart || endMin > dayEnd) {
    return `Окно вне рабочих часов (${wh.workdayStart}–${wh.workdayEnd})`;
  }
  return null;
}
