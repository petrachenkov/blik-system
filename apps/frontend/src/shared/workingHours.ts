import type { Dayjs } from 'dayjs';
import type { WorkingHours } from './api/system';

/** Пн=1 … Вс=7 (ISO) для d — чтобы сверять с WorkingHours.workingDays. */
export function isoDay(d: Dayjs): number {
  return d.day() === 0 ? 7 : d.day();
}

/**
 * Пропсы `disabledDate` / `disabledTime` для AntD DatePicker по рабочим часам визитов/задач.
 * Пустой объект, пока настройки не загрузились.
 */
export function buildWorkingHoursDisabled(wh: WorkingHours | undefined) {
  if (!wh) return {};
  const [sh, sm] = wh.workdayStart.split(':').map(Number);
  const [eh, em] = wh.workdayEnd.split(':').map(Number);
  return {
    disabledDate: (d: Dayjs) => !wh.workingDays.includes(isoDay(d)) || wh.holidays.includes(d.format('YYYY-MM-DD')),
    disabledTime: () => ({
      disabledHours: () => Array.from({ length: 24 }, (_, h) => h).filter((h) => h < sh || h > eh),
      disabledMinutes: (h: number) => {
        if (h === sh) return Array.from({ length: 60 }, (_, m) => m).filter((m) => m < sm);
        if (h === eh) return Array.from({ length: 60 }, (_, m) => m).filter((m) => m > em);
        return [];
      },
    }),
  };
}
