import { checkSlotWithinWorkingHours, type WorkingHours } from '../../common/utils/working-hours.js';

export interface RawSlot {
  start: string;
  end: string;
}

export interface ParsedSlot {
  start: Date;
  end: Date;
}

/**
 * Проверка предложенных окон визита (см. план "Планирование визита"): 1–3 штуки, валидные даты,
 * начало раньше конца, не в прошлом. Если передан workingHours — каждое окно должно целиком
 * укладываться в рабочий день (см. план "Доработка календаря визитов"). Бросает Error с
 * человекочитаемым текстом — контроллер/сервис оборачивает в BadRequestException.
 */
export function validateVisitSlots(
  slots: RawSlot[],
  now: number = Date.now(),
  workingHours?: WorkingHours,
): ParsedSlot[] {
  if (slots.length < 1 || slots.length > 3) {
    throw new Error('Нужно предложить от 1 до 3 окон');
  }
  return slots.map((s) => {
    const start = new Date(s.start);
    const end = new Date(s.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error('Некорректная дата в окне визита');
    }
    if (start.getTime() >= end.getTime()) {
      throw new Error('Начало окна должно быть раньше конца');
    }
    if (start.getTime() < now) {
      throw new Error('Нельзя предложить окно в прошлом');
    }
    if (workingHours) {
      const problem = checkSlotWithinWorkingHours(start, end, workingHours);
      if (problem) throw new Error(problem);
    }
    return { start, end };
  });
}
