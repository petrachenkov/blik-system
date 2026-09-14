import { useEffect, useState } from 'react';

/** Возвращает значение, обновляющееся не чаще, чем раз в delayMs после последнего изменения
 * входного value — для live-подсказок при вводе текста (см. план "Авто-подсказка статьи БЗ"). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
