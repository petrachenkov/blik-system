import { loadSheetGrid, loadWeekMarkersForSheet, openWorkbook, type WeekMarkers } from "./xlsx.js";
import type { GroupSchedule, Lesson, MainScheduleSnapshot, ScheduleSlot } from "../types.js";

const COURSE_TABS = ["1 курс", "2 Курс", "3 Курс", "4 Курс"];

const TEACHER_LINE_RE = /^[А-ЯЁ][а-яёА-ЯЁ-]+(\s+[А-ЯЁ]\.\s?[А-ЯЁ]\.)+(\s*,\s*[А-ЯЁ][а-яёА-ЯЁ-]+(\s+[А-ЯЁ]\.\s?[А-ЯЁ]\.)+)*$/;

/**
 * A cell usually looks like "Subject\nTeacher" but can stack two lessons
 * (biweekly rotation) as "SubjectA\nTeacherA\nSubjectB\nTeacherB", and long
 * subjects can wrap onto extra lines. We split on lines that look like a
 * teacher signature ("Иванов И.И." possibly comma-joined).
 */
function splitLessonCell(cell: string): { subject: string; teacher: string }[] {
  const lines = cell
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const lessons: { subject: string; teacher: string }[] = [];
  let buffer: string[] = [];
  for (const line of lines) {
    if (TEACHER_LINE_RE.test(line)) {
      lessons.push({ subject: buffer.join(" ").trim(), teacher: line });
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  if (buffer.length > 0) {
    // leftover text with no teacher line (e.g. cells with a blank teacher)
    lessons.push({ subject: buffer.join(" ").trim(), teacher: "" });
  }
  return lessons.length ? lessons : [{ subject: cell.trim(), teacher: "" }];
}

function splitRoomCell(cell: string, count: number): string[] {
  const lines = cell
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (count <= 1) return [lines.join(", ") || ""];
  if (lines.length >= count) return lines.slice(0, count);
  // pad with the last known room if the sheet didn't repeat it
  const padded = [...lines];
  while (padded.length < count) padded.push(lines[lines.length - 1] ?? "");
  return padded;
}

function parseCourseTab(
  rows: string[][],
  courseName: string,
  markers: WeekMarkers
): { groups: GroupSchedule[]; groupNames: string[] } {
  if (rows.length === 0) return { groups: [], groupNames: [] };
  const header = rows[0] || [];
  const groupColumns: { name: string; col: number }[] = [];
  for (let col = 3; col < header.length; col += 2) {
    const name = (header[col] || "").trim();
    if (name) groupColumns.push({ name, col });
  }

  const slotsByGroup = new Map<string, ScheduleSlot[]>();
  for (const g of groupColumns) slotsByGroup.set(g.name, []);

  let currentDay = "";
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => !c || !c.trim())) continue;
    const dayCell = (row[0] || "").trim();
    if (dayCell) currentDay = dayCell;
    const time = (row[1] || "").trim();
    const pair = (row[2] || "").trim();
    if (!time && !pair) continue;

    for (const g of groupColumns) {
      const lessonCell = (row[g.col] || "").trim();
      const roomCell = (row[g.col + 1] || "").trim();
      const lessons: Lesson[] = [];
      if (lessonCell) {
        const split = splitLessonCell(lessonCell);
        const rooms = splitRoomCell(roomCell, split.length);
        const weekColors = markers.byCell.get(`${r}:${g.col}`) || [];
        split.forEach((s, i) => {
          const lesson: Lesson = { subject: s.subject, teacher: s.teacher, room: rooms[i] ?? "" };
          if (weekColors[i]) lesson.week = weekColors[i];
          lessons.push(lesson);
        });
      }
      slotsByGroup.get(g.name)!.push({ day: currentDay, time, pair, lessons });
    }
  }

  const groups: GroupSchedule[] = groupColumns.map((g) => ({
    group: g.name,
    course: courseName,
    slots: slotsByGroup.get(g.name) || [],
  }));
  return { groups, groupNames: groupColumns.map((g) => g.name) };
}

export async function loadMainSchedule(spreadsheetId: string): Promise<MainScheduleSnapshot> {
  const groups: Record<string, GroupSchedule> = {};
  const groupsByCourse: Record<string, string[]> = {};

  const { zip, sheets, sharedStrings } = await openWorkbook(spreadsheetId);

  for (const courseName of COURSE_TABS) {
    const sheetRef = sheets.find((s) => s.name === courseName);
    if (!sheetRef) {
      console.error(`[main-schedule] tab "${courseName}" not found in workbook`);
      groupsByCourse[courseName] = [];
      continue;
    }
    const [rows, markers] = await Promise.all([
      loadSheetGrid(zip, sheetRef.path, sharedStrings),
      loadWeekMarkersForSheet(zip, sheetRef.path),
    ]);
    const { groups: courseGroups, groupNames } = parseCourseTab(rows, courseName, markers);
    groupsByCourse[courseName] = groupNames;
    for (const g of courseGroups) groups[g.group] = g;
  }

  return {
    fetchedAt: new Date().toISOString(),
    groups,
    courses: COURSE_TABS,
    groupsByCourse,
  };
}
