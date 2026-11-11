export type WeekColor = "red" | "blue";

export interface Lesson {
  subject: string;
  teacher: string;
  room: string;
  /** set only when this lesson happens on alternating weeks (marked with a colored circle in the sheet) */
  week?: WeekColor;
}

export interface ScheduleSlot {
  day: string; // "Понедельник" .. "Суббота"
  time: string; // "8:30 - 10:05"
  pair: string; // "1".."6" or "-" for a break
  lessons: Lesson[]; // usually 1, sometimes 2 for biweekly rotation
}

export interface GroupSchedule {
  group: string;
  course: string; // "1 курс" .. "4 курс"
  slots: ScheduleSlot[];
}

export interface MainScheduleSnapshot {
  fetchedAt: string;
  groups: Record<string, GroupSchedule>; // key: group name
  courses: string[]; // course tab names, in order
  groupsByCourse: Record<string, string[]>;
}

export interface ChangeEntry {
  pair: string; // "1".."6"
  subject: string;
  teacher: string;
  room: string;
  raw: string;
}

export interface GroupChanges {
  group: string;
  entries: ChangeEntry[]; // only non-empty pairs
}

export interface ChangesSnapshot {
  fetchedAt: string;
  dateLabel: string | null; // e.g. "14 сентября (понедельник)" as written in the sheet
  isoDate: string | null; // best-effort parsed date, e.g. "2026-09-14"
  groups: Record<string, GroupChanges>;
}
