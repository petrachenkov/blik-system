import { useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Radio, Segmented, Space, Typography, App as AntdApp } from 'antd';
import { LeftOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import dayjs, { type Dayjs } from 'dayjs';
import { fetchVisitsCalendar, rescheduleVisit, type CalendarVisit } from '../../shared/api/visits';
import { fetchCalendarTasks, updateCalendarTask, type CalendarTask } from '../../shared/api/calendarTasks';
import { fetchWorkingHours } from '../../shared/api/system';
import { useFeatureFlag } from '../../shared/flags/FeatureFlagsContext';
import { useAuth } from '../../shared/auth/AuthContext';
import { extractErrorMessage } from '../../shared/api/errors';
import { CalendarTaskModal } from './CalendarTaskModal';

const HOUR_PX = 48;
const SNAP_MIN = 15;
const GUTTER = 56;
const WEEKDAY_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTH_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** Понедельник недели, содержащей d (dayjs без загруженной ru-локали считает неделю с воскресенья). */
function startOfIsoWeek(d: Dayjs): Dayjs {
  const shift = (d.day() + 6) % 7; // Пн=0 … Вс=6
  return d.startOf('day').subtract(shift, 'day');
}

function ruWeekdayIndex(d: Dayjs): number {
  return (d.day() + 6) % 7;
}

/** Детерминированный цвет по id сотрудника — для режима «вся команда». */
function personColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h}, 55%, 45%)`;
}

type CalItem =
  | { kind: 'visit'; id: string; personId: string; start: Dayjs; end: Dayjs; visit: CalendarVisit }
  | { kind: 'task'; id: string; personId: string; start: Dayjs; end: Dayjs; task: CalendarTask };

interface DragState {
  kind: 'visit' | 'task';
  id: string;
  pointerId: number;
  originX: number;
  originY: number;
  dayIndex: number;
  ghost: { start: Dayjs; end: Dayjs; dayIndex: number } | null;
}

type Filter = 'all' | 'visits' | 'tasks';

export function CalendarPage() {
  const enabled = useFeatureFlag('visits');
  const { user } = useAuth();
  const navigate = useNavigate();
  const { message, modal } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const gridRef = useRef<HTMLDivElement>(null);
  const draggedRef = useRef(false);

  const [view, setView] = useState<'week' | 'day'>('week');
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [filter, setFilter] = useState<Filter>('all');
  const [anchor, setAnchor] = useState<Dayjs>(() => dayjs());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [modalState, setModalState] = useState<
    { mode: 'create'; initial?: { start?: Dayjs; end?: Dayjs } } | { mode: 'edit'; task: CalendarTask } | null
  >(null);

  const isAdmin = user?.role === 'ADMIN';
  const effScope = isAdmin ? scope : 'mine';

  const rangeStart = view === 'week' ? startOfIsoWeek(anchor) : anchor.startOf('day');
  const days = view === 'week' ? 7 : 1;
  const rangeEnd = rangeStart.add(days, 'day');

  const { data: wh } = useQuery({ queryKey: ['working-hours'], queryFn: fetchWorkingHours });
  const dayStartHour = wh ? Math.min(Number(wh.workdayStart.slice(0, 2)), 8) : 8;
  const dayEndHour = wh ? Math.max(Number(wh.workdayEnd.slice(0, 2)) + 1, 19) : 19;
  const hours = Array.from({ length: dayEndHour - dayStartHour }, (_, i) => dayStartHour + i);
  const gridHeight = hours.length * HOUR_PX;

  const rangeParams = { from: rangeStart.toISOString(), to: rangeEnd.toISOString(), scope: effScope } as const;

  const { data: visits = [], isLoading: visitsLoading } = useQuery({
    queryKey: ['visits-calendar', rangeParams.from, days, effScope],
    queryFn: () => fetchVisitsCalendar(rangeParams),
    enabled,
  });
  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['calendar-tasks', rangeParams.from, days, effScope],
    queryFn: () => fetchCalendarTasks(rangeParams),
    enabled,
  });

  const rescheduleMutation = useMutation({
    mutationFn: (v: { visitId: string; start: string; end: string }) => rescheduleVisit(v.visitId, { start: v.start, end: v.end }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['visits-calendar'] });
      void queryClient.invalidateQueries({ queryKey: ['my-day'] });
      message.success('Визит перенесён');
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Не удалось перенести визит')),
  });

  const taskMoveMutation = useMutation({
    mutationFn: (v: { id: string; start: string; end: string }) => updateCalendarTask(v.id, { start: v.start, end: v.end }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['calendar-tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['my-day'] });
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Не удалось перенести задачу')),
  });

  // Объединяем визиты и задачи в один список календарных элементов.
  const items = useMemo<CalItem[]>(() => {
    const out: CalItem[] = [];
    if (filter !== 'tasks') {
      for (const v of visits) {
        const s = v.scheduledStart ?? v.slots[0]?.start;
        const e = v.scheduledEnd ?? v.slots[0]?.end;
        if (!s || !e) continue;
        out.push({ kind: 'visit', id: v.id, personId: v.technician.id, start: dayjs(s), end: dayjs(e), visit: v });
      }
    }
    if (filter !== 'visits') {
      for (const t of tasks) {
        out.push({ kind: 'task', id: t.id, personId: t.ownerId, start: dayjs(t.start), end: dayjs(t.end), task: t });
      }
    }
    return out;
  }, [visits, tasks, filter]);

  // Пересечения одного и того же сотрудника (визит↔визит, визит↔задача, задача↔задача).
  const conflictIds = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        if (a.personId !== b.personId) continue;
        if (a.kind === 'task' && a.task.done) continue;
        if (b.kind === 'task' && b.task.done) continue;
        if (a.start.isBefore(b.end) && b.start.isBefore(a.end)) {
          set.add(a.id);
          set.add(b.id);
        }
      }
    }
    return set;
  }, [items]);

  const itemsByDay = useMemo(() => {
    const map: CalItem[][] = Array.from({ length: days }, () => []);
    for (const it of items) {
      const idx = it.start.startOf('day').diff(rangeStart.startOf('day'), 'day');
      if (idx >= 0 && idx < days) map[idx].push(it);
    }
    return map;
  }, [items, days, rangeStart]);

  if (!enabled) {
    return <Alert type="info" showIcon message="Планирование визитов и работ отключено администратором." />;
  }

  const topFor = (t: Dayjs) => (t.hour() + t.minute() / 60 - dayStartHour) * HOUR_PX;
  const heightFor = (s: Dayjs, e: Dayjs) => Math.max((e.diff(s, 'minute') / 60) * HOUR_PX, 18);

  const draggable = (it: CalItem) =>
    it.kind === 'task' || (it.kind === 'visit' && it.visit.status === 'CONFIRMED');

  const onPointerDown = (e: React.PointerEvent, it: CalItem, dayIndex: number) => {
    if (!draggable(it)) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ kind: it.kind, id: it.id, pointerId: e.pointerId, originX: e.clientX, originY: e.clientY, dayIndex, ghost: null });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId || !gridRef.current) return;
    const colWidth = (gridRef.current.clientWidth - GUTTER) / days;
    const dayDelta = days > 1 ? Math.round((e.clientX - drag.originX) / colWidth) : 0;
    const newDayIndex = Math.min(Math.max(drag.dayIndex + dayDelta, 0), days - 1);
    const minutesDelta = Math.round((e.clientY - drag.originY) / HOUR_PX * 60 / SNAP_MIN) * SNAP_MIN;
    const orig = items.find((it) => it.id === drag.id);
    if (!orig) return;
    if (dayDelta === 0 && minutesDelta === 0) {
      setDrag({ ...drag, ghost: null });
      return;
    }
    const shiftDays = newDayIndex - drag.dayIndex;
    setDrag({
      ...drag,
      ghost: {
        start: orig.start.add(shiftDays, 'day').add(minutesDelta, 'minute'),
        end: orig.end.add(shiftDays, 'day').add(minutesDelta, 'minute'),
        dayIndex: newDayIndex,
      },
    });
  };

  const onPointerUp = () => {
    if (!drag) return;
    const { kind, id, ghost } = drag;
    setDrag(null);
    if (!ghost) return;
    draggedRef.current = true;
    setTimeout(() => { draggedRef.current = false; }, 0);

    if (kind === 'task') {
      taskMoveMutation.mutate({ id, start: ghost.start.toISOString(), end: ghost.end.toISOString() });
      return;
    }
    const visit = visits.find((v) => v.id === id);
    modal.confirm({
      title: 'Перенести визит?',
      content: `Заявка ${visit?.ticket.number ?? ''} — на ${ghost.start.format('DD.MM HH:mm')}. Небольшой сдвиг применится сразу, значительный — уйдёт заявителю на переподтверждение.`,
      okText: 'Перенести',
      cancelText: 'Отмена',
      onOk: () => rescheduleMutation.mutateAsync({ visitId: id, start: ghost.start.toISOString(), end: ghost.end.toISOString() }),
    });
  };

  const onCellClick = (dayIndex: number, e: React.MouseEvent) => {
    if (drag || draggedRef.current) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const minutesFromTop = ((e.clientY - rect.top) / HOUR_PX) * 60;
    const snapped = Math.floor(minutesFromTop / 30) * 30;
    const start = rangeStart.add(dayIndex, 'day').hour(dayStartHour).minute(0).add(snapped, 'minute');
    setModalState({ mode: 'create', initial: { start, end: start.add(1, 'hour') } });
  };

  const openItem = (it: CalItem) => {
    if (drag || draggedRef.current) return;
    if (it.kind === 'visit') {
      navigate(`/tickets/${it.visit.ticket.id}`);
    } else if (it.task.ticket) {
      navigate(`/tickets/${it.task.ticket.id}`);
    } else {
      setModalState({ mode: 'edit', task: it.task });
    }
  };

  return (
    <Space direction="vertical" size="middle" style={{ display: 'flex' }}>
      <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
        <Space wrap size="middle">
          <Segmented
            value={view}
            onChange={(v) => setView(v as 'week' | 'day')}
            options={[
              { label: 'Неделя', value: 'week' },
              { label: 'День', value: 'day' },
            ]}
          />
          <Space.Compact>
            <Button icon={<LeftOutlined />} onClick={() => setAnchor(anchor.subtract(days, 'day'))} />
            <Button onClick={() => setAnchor(dayjs())}>Сегодня</Button>
            <Button icon={<RightOutlined />} onClick={() => setAnchor(anchor.add(days, 'day'))} />
          </Space.Compact>
          <Typography.Text strong>
            {view === 'week'
              ? `${rangeStart.format('DD.MM')} — ${rangeStart.add(6, 'day').format('DD.MM.YYYY')}`
              : `${WEEKDAY_RU[ruWeekdayIndex(rangeStart)]}, ${rangeStart.date()} ${MONTH_RU[rangeStart.month()]} ${rangeStart.year()}`}
          </Typography.Text>
        </Space>
        <Space wrap size="middle">
          <Segmented
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            options={[
              { label: 'Всё', value: 'all' },
              { label: 'Визиты', value: 'visits' },
              { label: 'Задачи', value: 'tasks' },
            ]}
          />
          {isAdmin && (
            <Radio.Group
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              optionType="button"
              options={[
                { label: 'Мои', value: 'mine' },
                { label: 'Вся команда', value: 'all' },
              ]}
            />
          )}
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalState({ mode: 'create' })}>
            Задача
          </Button>
        </Space>
      </Space>

      <Card styles={{ body: { padding: 0, overflow: 'auto' } }} loading={visitsLoading || tasksLoading}>
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(0,0,0,0.06)', position: 'sticky', top: 0, background: 'inherit', zIndex: 2 }}>
          <div style={{ width: GUTTER, flexShrink: 0 }} />
          {Array.from({ length: days }, (_, i) => {
            const d = rangeStart.add(i, 'day');
            const today = d.isSame(dayjs(), 'day');
            return (
              <div key={i} style={{ flex: 1, textAlign: 'center', padding: '6px 4px', fontWeight: today ? 700 : 500, color: today ? '#1677ff' : undefined }}>
                {WEEKDAY_RU[ruWeekdayIndex(d)]} {d.format('DD.MM')}
              </div>
            );
          })}
        </div>

        <div ref={gridRef} style={{ display: 'flex', position: 'relative' }} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
          <div style={{ width: GUTTER, flexShrink: 0 }}>
            {hours.map((h) => (
              <div key={h} style={{ height: HOUR_PX, fontSize: 11, color: '#999', textAlign: 'right', paddingRight: 6, transform: 'translateY(-6px)' }}>
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {Array.from({ length: days }, (_, dayIndex) => (
            <div
              key={dayIndex}
              onClick={(e) => onCellClick(dayIndex, e)}
              style={{
                flex: 1,
                position: 'relative',
                height: gridHeight,
                borderLeft: '1px solid rgba(0,0,0,0.06)',
                backgroundImage: `repeating-linear-gradient(rgba(0,0,0,0.05) 0 1px, transparent 1px ${HOUR_PX}px)`,
              }}
            >
              {itemsByDay[dayIndex]?.map((it) => {
                const dragging = drag?.id === it.id;
                const conflict = conflictIds.has(it.id);
                const isVisit = it.kind === 'visit';
                const proposed = isVisit && it.visit.status === 'PROPOSED';
                const done = it.kind === 'task' && it.task.done;
                const color = isVisit
                  ? (effScope === 'all' ? personColor(it.personId) : '#1677ff')
                  : (effScope === 'all' ? personColor(it.personId) : '#64748b');
                const label = isVisit
                  ? it.visit.ticket.number
                  : it.task.title + (it.task.ticket ? ` · ${it.task.ticket.number}` : '');
                const sub = isVisit
                  ? `${it.visit.ticket.location.building}, ${it.visit.ticket.location.room}`
                  : (it.task.note ?? '');
                return (
                  <div
                    key={it.id}
                    onPointerDown={(e) => onPointerDown(e, it, dayIndex)}
                    onClick={(e) => { e.stopPropagation(); openItem(it); }}
                    title={label + (conflict ? ' · пересекается с другим блоком' : '')}
                    style={{
                      position: 'absolute',
                      left: 3,
                      right: 3,
                      top: topFor(it.start),
                      height: heightFor(it.start, it.end),
                      background: proposed ? 'transparent' : done ? '#e2e8f0' : color,
                      border: conflict
                        ? '2px solid #ff4d4f'
                        : (proposed || (it.kind === 'task' && !done))
                          ? `1px dashed ${done ? '#cbd5e1' : color}`
                          : `1px solid ${done ? '#cbd5e1' : color}`,
                      color: proposed || done ? '#475569' : '#fff',
                      borderRadius: 6,
                      padding: '2px 6px',
                      fontSize: 11,
                      lineHeight: 1.3,
                      overflow: 'hidden',
                      textDecoration: done ? 'line-through' : undefined,
                      cursor: draggable(it) ? 'grab' : 'pointer',
                      opacity: dragging ? 0.4 : 1,
                      userSelect: 'none',
                    }}
                  >
                    <strong>{it.start.format('HH:mm')}</strong> {label}
                    {sub && <div style={{ opacity: 0.85 }}>{sub}</div>}
                  </div>
                );
              })}

              {drag?.ghost && drag.ghost.dayIndex === dayIndex && (
                <div
                  style={{
                    position: 'absolute',
                    left: 3,
                    right: 3,
                    top: topFor(drag.ghost.start),
                    height: heightFor(drag.ghost.start, drag.ghost.end),
                    background: 'rgba(22,119,255,0.25)',
                    border: '2px dashed #1677ff',
                    borderRadius: 6,
                    fontSize: 11,
                    padding: '2px 6px',
                    pointerEvents: 'none',
                  }}
                >
                  {drag.ghost.start.format('HH:mm')}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Клик по свободному месту — новая задача. Перетащите блок, чтобы перенести его.
        Пунктирные блоки — задачи и ещё не подтверждённые визиты; красная рамка — пересечение по времени.
      </Typography.Text>

      <CalendarTaskModal
        open={modalState !== null}
        onClose={() => setModalState(null)}
        initial={modalState?.mode === 'create' ? modalState.initial : undefined}
        taskToEdit={modalState?.mode === 'edit' ? modalState.task : null}
      />
    </Space>
  );
}
