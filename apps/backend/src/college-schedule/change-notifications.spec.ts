import { describe, expect, it } from 'vitest';
import { describeSheetChanges } from './change-notifications.js';
import type { ChangesSnapshot, MainScheduleSnapshot } from './types.js';

const change = { pair: '3', subject: 'История', teacher: 'Новый преподаватель', room: '20', raw: '' };
const snapshot: ChangesSnapshot = {
  fetchedAt: '2026-11-10T12:00:00Z', dateLabel: '11 ноября', isoDate: '2026-11-11',
  groups: { '1-ТМСС': { group: '1-ТМСС', entries: [change] } },
};
const main: MainScheduleSnapshot = {
  fetchedAt: snapshot.fetchedAt, courses: [], groupsByCourse: {},
  groups: { '1-ТМСС': { group: '1-ТМСС', course: '1 курс', slots: [{
    day: 'Среда', pair: '3', time: '12:45 - 14:20',
    lessons: [{ subject: 'География', teacher: 'Основной преподаватель', room: '16' }],
  }] } },
};

describe('Уведомления о заменах', () => {
  it('направляет замену группе и обоим преподавателям', () => {
    const messages = describeSheetChanges(undefined, snapshot, main);
    expect(messages.map(({ target }) => target)).toEqual(['1-ТМСС', 'Новый преподаватель', 'Основной преподаватель']);
    for (const message of messages) expect(message.text).toContain('3-я пара — История · Новый преподаватель · 📍 20');
  });

  it('игнорирует повторную загрузку и сообщает о снятии замены', () => {
    const identical = { ...snapshot, fetchedAt: '2026-11-10T12:01:00Z' };
    expect(describeSheetChanges(snapshot, identical, main)).toEqual([]);
    const removed = describeSheetChanges(snapshot, { ...identical, groups: {} }, main);
    expect(removed).toHaveLength(3);
    for (const message of removed) expect(message.text).toContain('3-я пара — замена снята');
  });
});
