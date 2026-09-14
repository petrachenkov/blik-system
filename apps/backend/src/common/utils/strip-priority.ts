// Запись истории CLASSIFIED хранит "Категория / Приоритет" одной строкой
// (см. TicketsService.classify). Приоритет — рабочая метрика сисадминов, преподавателю
// в истории заявки и в справке о его заявках не показываем (см. фидбэк), поэтому обрезаем
// строку до " / " при выдаче не-сотруднику.
export function stripPriority(value: string | null): string | null {
  if (!value) return value;
  const separatorIndex = value.indexOf(' / ');
  return separatorIndex === -1 ? value : value.slice(0, separatorIndex);
}
