/**
 * "Тихие часы" уведомлений (см. план) — глобальное окно, отложенная доставка. Оба параметра
 * не заданы -> фича выключена (всегда false, ничего не откладывается). Поддерживает окно
 * через полночь (например 22:00–08:00): в этом случае "внутри" — либо >= start, либо < end.
 */
export function isWithinQuietHours(now: Date, start?: string, end?: string): boolean {
  if (!start || !end) return false;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);

  if (startMinutes === endMinutes) return false; // нулевое окно — тихих часов фактически нет

  if (startMinutes < endMinutes) {
    // Обычное окно в пределах одних суток, например 01:00–06:00.
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }

  // Окно через полночь, например 22:00–08:00.
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}
