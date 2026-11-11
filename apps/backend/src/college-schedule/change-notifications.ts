import type { ScheduleNotice } from './schedule-max.service.js';
import type { ChangeEntry, ChangesSnapshot, MainScheduleSnapshot } from './types.js';

export const teachersIn = (teacher?: string) => (teacher ?? '').split(',').map((name) => name.trim()).filter(Boolean);
const entrySignature = (entry: ChangeEntry) => JSON.stringify([entry.subject, entry.teacher, entry.room]);
const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', timeZone: 'UTC' });

export function describeSheetChanges(before: ChangesSnapshot | undefined, after: ChangesSnapshot, schedule?: MainScheduleSnapshot) {
  const notices: ScheduleNotice[] = [];
  const teachers = new Map<string, string[]>();
  const date = after.dateLabel ?? after.isoDate;
  const instant = Date.parse(`${after.isoDate}T12:00:00Z`);
  const day = Number.isFinite(instant) ? weekday.format(instant).toLocaleLowerCase('ru') : '';
  const format = (title: string, lines: string[]) => [title, `📅 ${date}`, ...lines].join('\n');

  for (const group of new Set([...Object.keys(before?.groups ?? {}), ...Object.keys(after.groups)])) {
    const oldEntries = new Map((before?.groups[group]?.entries ?? []).map((entry) => [entry.pair, entry]));
    const newEntries = new Map((after.groups[group]?.entries ?? []).map((entry) => [entry.pair, entry]));
    const lines: string[] = [];
    for (const pair of new Set([...newEntries.keys(), ...oldEntries.keys()])) {
      const entry = newEntries.get(pair);
      const old = oldEntries.get(pair);
      if (entry && old && entrySignature(old) === entrySignature(entry)) continue;
      const details = entry
        ? [entry.subject, entry.teacher, entry.room && `📍 ${entry.room}`].filter(Boolean).join(' · ')
        : 'замена снята';
      const line = `${pair}-я пара — ${details}`;
      lines.push(line);

      const normal = schedule?.groups[group]?.slots.find((slot) => slot.pair === pair && slot.day.toLocaleLowerCase('ru') === day);
      const involved = new Set([
        ...teachersIn(entry?.teacher), ...teachersIn(old?.teacher),
        ...(normal?.lessons.flatMap((lesson) => teachersIn(lesson.teacher)) ?? []),
      ]);
      for (const teacher of involved) {
        const entries = teachers.get(teacher) ?? [];
        entries.push(`${group} · ${line}`);
        teachers.set(teacher, entries);
      }
    }
    if (lines.length) notices.push({ scope: 'group', target: group, text: format(`🔄 Изменения расписания · ${group}`, lines) });
  }
  for (const [teacher, lines] of teachers) {
    notices.push({ scope: 'teacher', target: teacher, text: format(`🔄 Изменения расписания · ${teacher}`, lines) });
  }
  return notices;
}
