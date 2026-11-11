import { fetchSheetTabCsv } from "./fetchSheet.js";
import type { ChangeEntry, ChangesSnapshot, GroupChanges } from "../types.js";

const CHANGES_TABS = ["Лист1", "Лист2", "Лист3", "Лист4"];

const ROOM_LINE_RE = /ауд|с\/з|ч\/з|^\d+[.,\s]*$/i;
const TEACHER_LINE_RE = /^[А-ЯЁ][а-яёА-ЯЁ-]+(\s+[А-ЯЁ]\.\s?[А-ЯЁ]\.)+(\s*,\s*[А-ЯЁ][а-яёА-ЯЁ-]+(\s+[А-ЯЁ]\.\s?[А-ЯЁ]\.)+)*$/;

const MONTHS: Record<string, number> = {
  января: 1,
  февраля: 2,
  марта: 3,
  апреля: 4,
  мая: 5,
  июня: 6,
  июля: 7,
  августа: 8,
  сентября: 9,
  октября: 10,
  ноября: 11,
  декабря: 12,
};

function parseRuDate(label: string): string | null {
  const m = label.replace(/\s+/g, " ").match(/(\d{1,2})\s+([а-яё]+)/i);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;

  const now = new Date();
  let year = now.getFullYear();
  // handle school-year wraparound: if the parsed month is far in the "past"
  // relative to now (e.g. it's December and the sheet says "март"), assume next year
  const candidate = new Date(year, month - 1, day);
  const diffDays = (candidate.getTime() - now.getTime()) / 86_400_000;
  if (diffDays < -200) year += 1;
  else if (diffDays > 200) year -= 1;

  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function splitChangeCell(cell: string): { subject: string; teacher: string; room: string } {
  const lines = cell
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { subject: "", teacher: "", room: "" };

  let room = "";
  if (lines.length > 1 && ROOM_LINE_RE.test(lines[lines.length - 1])) {
    room = lines.pop()!;
  }
  let teacher = "";
  if (lines.length > 1 && TEACHER_LINE_RE.test(lines[lines.length - 1])) {
    teacher = lines.pop()!;
  }
  const subject = lines.join(" ").trim();
  return { subject, teacher, room };
}

function parseTab(rows: string[][]): ChangesSnapshot | null {
  if (rows.length < 2) return null;
  const dateLabel = (rows[0]?.[0] || "").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  if (!dateLabel) return null;

  const headerRow = rows[1] || [];
  const pairColumns: { pair: string; col: number }[] = [];
  for (let col = 1; col < headerRow.length; col++) {
    const label = (headerRow[col] || "").trim();
    if (/^\d+$/.test(label)) pairColumns.push({ pair: label, col });
  }
  if (pairColumns.length === 0) return null;

  const groups: Record<string, GroupChanges> = {};
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const groupName = (row[0] || "").trim();
    if (!groupName) continue;

    const entries: ChangeEntry[] = [];
    for (const { pair, col } of pairColumns) {
      const raw = (row[col] || "").trim();
      if (!raw) continue;
      const { subject, teacher, room } = splitChangeCell(raw);
      entries.push({ pair, subject, teacher, room, raw: raw.replace(/\n/g, " ") });
    }
    if (entries.length > 0) {
      groups[groupName] = { group: groupName, entries };
    }
  }

  return {
    fetchedAt: new Date().toISOString(),
    dateLabel,
    isoDate: parseRuDate(dateLabel),
    groups,
  };
}

/**
 * Reads every tab of the changes spreadsheet and returns the one that best
 * represents "today" (exact date match wins; otherwise falls back to the
 * only tab that has data, since the staff usually keep just one tab live).
 */
export async function loadChanges(spreadsheetId: string, todayIso: string) {
  const parsedTabs: ChangesSnapshot[] = [];
  for (const tab of CHANGES_TABS) {
    const rows = await fetchSheetTabCsv(spreadsheetId, tab);
    const parsed = parseTab(rows);
    if (parsed) parsedTabs.push(parsed);
  }
  const upcoming = new Map<string, ChangesSnapshot>();
  for (const tab of parsedTabs) {
    if (tab.isoDate && tab.isoDate >= todayIso && !upcoming.has(tab.isoDate)) upcoming.set(tab.isoDate, tab);
  }
  return { visible: selectVisibleTab(parsedTabs, todayIso), upcoming: [...upcoming.values()] };
}

function selectVisibleTab(parsedTabs: ChangesSnapshot[], todayIso: string): ChangesSnapshot | null {
  if (parsedTabs.length === 0) return null;

  const exact = parsedTabs.find((t) => t.isoDate === todayIso);
  if (exact) return exact;
  if (parsedTabs.length === 1) return parsedTabs[0];

  // multiple non-empty tabs but none match today: prefer the closest future/today date
  const withDates = parsedTabs.filter((t) => t.isoDate);
  if (withDates.length) {
    withDates.sort((a, b) => (a.isoDate! < b.isoDate! ? -1 : 1));
    const upcoming = withDates.find((t) => t.isoDate! >= todayIso);
    return upcoming || withDates[withDates.length - 1];
  }
  return parsedTabs[0];
}
