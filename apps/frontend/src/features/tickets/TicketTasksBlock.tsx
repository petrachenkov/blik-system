import { useState } from 'react';
import { Button, Card, Checkbox, Popconfirm, Space, Tag, Typography, App as AntdApp } from 'antd';
import { CarryOutOutlined, DeleteOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  deleteCalendarTask,
  fetchTicketTasks,
  updateCalendarTask,
  type CalendarTask,
} from '../../shared/api/calendarTasks';
import { changeTicketStatus } from '../../shared/api/tickets';
import { useFeatureFlag } from '../../shared/flags/FeatureFlagsContext';
import { extractErrorMessage } from '../../shared/api/errors';
import { CalendarTaskModal } from '../visits/CalendarTaskModal';
import type { TicketStatus } from '../../shared/types';

/**
 * Внутренние работы по заявке (см. план «Задачи в календаре») — планирует сотрудник, преподаватель
 * их не видит. Отметка «выполнено» у последней открытой задачи в статусе «В работе» предлагает
 * перевести заявку в «Решено» (как у визитов).
 */
export function TicketTasksBlock({
  ticketId,
  isStaff,
  ticketStatus,
}: {
  ticketId: string;
  isStaff: boolean;
  ticketStatus?: TicketStatus;
}) {
  const enabled = useFeatureFlag('visits');
  const { message, modal } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const { data: tasks = [] } = useQuery({
    queryKey: ['ticket-tasks', ticketId],
    queryFn: () => fetchTicketTasks(ticketId),
    enabled: enabled && isStaff,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['ticket-tasks', ticketId] });
    void queryClient.invalidateQueries({ queryKey: ['calendar-tasks'] });
    void queryClient.invalidateQueries({ queryKey: ['my-day'] });
  };

  const resolveMutation = useMutation({
    mutationFn: () => changeTicketStatus(ticketId, 'RESOLVED'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tickets', ticketId] });
      void queryClient.invalidateQueries({ queryKey: ['tickets', ticketId, 'history'] });
      message.success('Заявка переведена в «Решено»');
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Не удалось перевести заявку')),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => updateCalendarTask(id, { done }),
    onSuccess: (_data, vars) => {
      invalidate();
      const stillOpen = tasks.some((t) => t.id !== vars.id && !t.done);
      if (vars.done && !stillOpen && isStaff && ticketStatus === 'IN_PROGRESS') {
        modal.confirm({
          title: 'Работа по заявке выполнена',
          content: 'Перевести заявку в статус «Решено»?',
          okText: 'Перевести',
          cancelText: 'Позже',
          onOk: () => resolveMutation.mutateAsync(),
        });
      }
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Не удалось изменить задачу')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCalendarTask(id),
    onSuccess: () => { invalidate(); message.success('Задача удалена'); },
    onError: (e) => message.error(extractErrorMessage(e, 'Не удалось удалить задачу')),
  });

  if (!enabled || !isStaff) return null;

  const fmt = (t: CalendarTask) => `${dayjs(t.start).format('DD.MM HH:mm')}–${dayjs(t.end).format('HH:mm')}`;

  return (
    <Card size="small" title={<Space><CarryOutOutlined /> Работа по заявке</Space>} style={{ marginBottom: 16 }}>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
        Внутренние работы, не требующие контакта с преподавателем. Видны только сотрудникам техподдержки.
      </Typography.Paragraph>

      {tasks.length === 0 && (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>Работа не запланирована.</Typography.Text>
      )}

      <Space direction="vertical" style={{ display: 'flex' }} size={6}>
        {tasks.map((t) => (
          <Space key={t.id} wrap style={{ justifyContent: 'space-between', width: '100%' }}>
            <Space>
              <Checkbox checked={t.done} onChange={(e) => toggleMutation.mutate({ id: t.id, done: e.target.checked })} />
              <span style={{ textDecoration: t.done ? 'line-through' : undefined }}>{t.title}</span>
              <Tag>{fmt(t)}</Tag>
              {t.owner && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t.owner.fullName}</Typography.Text>}
            </Space>
            <Popconfirm title="Удалить задачу?" onConfirm={() => deleteMutation.mutate(t.id)} okText="Удалить" cancelText="Нет">
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ))}
      </Space>

      <Button size="small" icon={<CarryOutOutlined />} style={{ marginTop: 10 }} onClick={() => setCreating(true)}>
        Запланировать работу
      </Button>

      <CalendarTaskModal open={creating} onClose={() => setCreating(false)} fixedTicketId={ticketId} />
    </Card>
  );
}
