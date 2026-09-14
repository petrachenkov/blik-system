const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/** Парсит строки вида "15m", "14d", "1h" в миллисекунды. Используется для TTL refresh-токена в БД. */
export function parseDurationToMs(duration: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/i.exec(duration.trim());
  if (!match) {
    throw new Error(`Некорректный формат длительности: "${duration}" (ожидается, например, "15m" или "14d")`);
  }
  const [, amount, unit] = match;
  return Number(amount) * UNIT_MS[unit.toLowerCase()];
}
