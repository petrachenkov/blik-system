import { Tag } from 'antd';
import { useEffect, useState } from 'react';
import dayjs from 'dayjs';

/**
 * Клиентский countdown-бейдж дедлайна (см. план — SLA считается на фронте в реальном
 * времени из responseDueAt/resolutionDueAt, а не ждёт серверный cron).
 */
export function SlaCountdown({ dueAt, breached, doneAt }: { dueAt: string | null; breached: boolean; doneAt: string | null }) {
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (doneAt || !dueAt) return;
    const interval = setInterval(() => forceTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, [dueAt, doneAt]);

  if (!dueAt) return <Tag>Не классифицирована</Tag>;
  if (doneAt) return <Tag color="default">Выполнено {dayjs(doneAt).format('DD.MM HH:mm')}</Tag>;

  const now = dayjs();
  const due = dayjs(dueAt);
  const diffMinutes = due.diff(now, 'minute');
  const isOverdue = breached || diffMinutes < 0;

  if (isOverdue) {
    return <Tag color="red">Просрочено ({due.format('DD.MM HH:mm')})</Tag>;
  }

  const color = diffMinutes < 60 ? 'orange' : diffMinutes < 240 ? 'gold' : 'green';
  const label = diffMinutes < 60 ? `${diffMinutes} мин` : `${Math.round(diffMinutes / 60)} ч`;

  return <Tag color={color}>Осталось {label}</Tag>;
}
