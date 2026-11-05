/** Короткий номер для интерфейса и уведомлений; исходный номер остаётся в БД. */
export function shortTicketNumber(value: string): string {
  return value.replace(/\bBLIK-0*(\d+)\b/g, 'Б-$1');
}
