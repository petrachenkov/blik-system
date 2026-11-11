export type WeekColor = "red" | "blue";

/** Returns the ISO date (YYYY-MM-DD) of the Monday of the week containing `iso`. */
export function mondayOfIsoWeek(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

function weeksBetweenMondays(mondayA: string, mondayB: string): number {
  const a = Date.parse(`${mondayA}T00:00:00Z`);
  const b = Date.parse(`${mondayB}T00:00:00Z`);
  return Math.round((b - a) / (7 * 86_400_000));
}

/**
 * Given a known anchor ("the week starting on `anchorMonday` is `anchorColor`"),
 * computes which color the week containing `targetIso` is — alternating every
 * 7 days from the anchor, indefinitely in either direction.
 */
export function colorForWeek(anchorMonday: string, anchorColor: WeekColor, targetIso: string): WeekColor {
  const targetMonday = mondayOfIsoWeek(targetIso);
  const diff = weeksBetweenMondays(anchorMonday, targetMonday);
  const isSameParity = ((diff % 2) + 2) % 2 === 0;
  if (isSameParity) return anchorColor;
  return anchorColor === "red" ? "blue" : "red";
}
