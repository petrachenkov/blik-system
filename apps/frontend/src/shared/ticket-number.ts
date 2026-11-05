/** Отображаем старые номера компактно, не меняя идентификаторы заявок. */
export function shortTicketNumber(value: string): string {
  return value.replace(/\bBLIK-0*(\d+)\b/g, 'Б-$1');
}
