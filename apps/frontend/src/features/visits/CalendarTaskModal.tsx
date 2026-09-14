import { useEffect } from 'react';
import { DatePicker, Form, Input, Modal, Select, App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import {
  createCalendarTask,
  updateCalendarTask,
  type CalendarTask,
} from '../../shared/api/calendarTasks';
import { fetchTickets } from '../../shared/api/tickets';
import { fetchUsers } from '../../shared/api/catalogs';
import { fetchWorkingHours } from '../../shared/api/system';
import { buildWorkingHoursDisabled, isoDay } from '../../shared/workingHours';
import { useAuth } from '../../shared/auth/AuthContext';
import { extractErrorMessage } from '../../shared/api/errors';
import type { WorkingHours } from '../../shared/api/system';

/** Ближайший рабочий слот от «сейчас»: если текущий час вне окна/выходной — следующий рабочий день на начало. */
function nextWorkingStart(wh: WorkingHours | undefined): Dayjs {
  const base = dayjs().add(1, 'hour').startOf('hour');
  if (!wh) return base;
  const [sh] = wh.workdayStart.split(':').map(Number);
  const [eh] = wh.workdayEnd.split(':').map(Number);
  let d = base;
  for (let i = 0; i < 14; i++) {
    const working = wh.workingDays.includes(isoDay(d)) && !wh.holidays.includes(d.format('YYYY-MM-DD'));
    if (working && d.hour() >= sh && d.hour() < eh) return d;
    if (working && d.hour() < sh) return d.hour(sh).minute(0);
    d = d.add(1, 'day').hour(sh).minute(0);
  }
  return base;
}

interface FormValues {
  title: string;
  range: [Dayjs, Dayjs];
  note?: string;
  ticketId?: string;
  ownerId?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Предзаполнение при создании (клик по пустой ячейке календаря). */
  initial?: { start?: Dayjs; end?: Dayjs };
  /** Жёстко привязать к заявке и скрыть выбор (открытие со страницы заявки). */
  fixedTicketId?: string;
  /** Режим редактирования существующей задачи. */
  taskToEdit?: CalendarTask | null;
}

export function CalendarTaskModal({ open, onClose, initial, fixedTicketId, taskToEdit }: Props) {
  const { user } = useAuth();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  const isAdmin = user?.role === 'ADMIN';
  const editing = Boolean(taskToEdit);

  const { data: wh } = useQuery({ queryKey: ['working-hours'], queryFn: fetchWorkingHours });
  const disabled = buildWorkingHoursDisabled(wh);

  const { data: staff = [] } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
    enabled: open && isAdmin && !editing,
  });
  const { data: ticketList } = useQuery({
    queryKey: ['tickets', 'task-picker'],
    queryFn: () => fetchTickets({ pageSize: 50, sortBy: 'createdAt', sortOrder: 'desc' }),
    enabled: open && !fixedTicketId && !editing,
  });

  useEffect(() => {
    if (!open) return;
    if (taskToEdit) {
      form.setFieldsValue({
        title: taskToEdit.title,
        range: [dayjs(taskToEdit.start), dayjs(taskToEdit.end)],
        note: taskToEdit.note ?? undefined,
        ticketId: taskToEdit.ticketId ?? undefined,
        ownerId: taskToEdit.ownerId,
      });
    } else {
      const start = initial?.start ?? nextWorkingStart(wh);
      form.setFieldsValue({
        title: '',
        range: [start, initial?.end ?? start.add(1, 'hour')],
        note: undefined,
        ticketId: fixedTicketId,
        ownerId: user?.id,
      });
    }
  }, [open, taskToEdit, initial, fixedTicketId, user?.id, wh, form]);

  const mutation = useMutation({
    mutationFn: (v: FormValues) => {
      const payload = {
        title: v.title.trim(),
        start: v.range[0].toISOString(),
        end: v.range[1].toISOString(),
        note: v.note?.trim() || undefined,
      };
      if (taskToEdit) return updateCalendarTask(taskToEdit.id, payload);
      return createCalendarTask({
        ...payload,
        ticketId: fixedTicketId ?? v.ticketId,
        ownerId: isAdmin ? v.ownerId : undefined,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['calendar-tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['ticket-tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['my-day'] });
      message.success(taskToEdit ? 'Задача обновлена' : 'Задача добавлена в календарь');
      onClose();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Не удалось сохранить задачу')),
  });

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={taskToEdit ? 'Сохранить' : 'Добавить'}
      cancelText="Отмена"
      confirmLoading={mutation.isPending}
      title={taskToEdit ? 'Задача' : 'Новая задача в календаре'}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={(v) => mutation.mutate(v)}>
        <Form.Item name="title" label="Что за работа" rules={[{ required: true, min: 2, message: 'Укажите название' }]}>
          <Input placeholder="Напр. Обход кабинетов 2 этажа" autoFocus />
        </Form.Item>
        <Form.Item name="range" label="Время" rules={[{ required: true, message: 'Укажите время' }]}>
          <DatePicker.RangePicker
            showTime={{ format: 'HH:mm', minuteStep: 15 }}
            format="DD.MM HH:mm"
            style={{ width: '100%' }}
            {...disabled}
          />
        </Form.Item>
        {!fixedTicketId && !editing && (
          <Form.Item name="ticketId" label="Заявка (необязательно)" tooltip="Внутренняя работа по заявке без контакта с преподавателем">
            <Select
              allowClear
              showSearch
              placeholder="Не привязана к заявке"
              optionFilterProp="label"
              options={(ticketList?.items ?? []).map((t) => ({
                value: t.id,
                label: `${t.number} — ${t.description.slice(0, 60)}`,
              }))}
            />
          </Form.Item>
        )}
        {isAdmin && !editing && (
          <Form.Item name="ownerId" label="В чей календарь">
            <Select
              showSearch
              optionFilterProp="label"
              options={staff
                .filter((u) => u.role === 'ADMIN' || u.role === 'INTERN')
                .map((u) => ({ value: u.id, label: u.fullName }))}
            />
          </Form.Item>
        )}
        <Form.Item name="note" label="Заметка (необязательно)">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
