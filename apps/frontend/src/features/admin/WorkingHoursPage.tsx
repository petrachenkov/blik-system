import { useState } from 'react';
import { Button, Card, Checkbox, DatePicker, Form, Space, Tag, TimePicker, Typography, App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { fetchWorkingHours, updateWorkingHours, type WorkingHours } from '../../shared/api/system';
import { extractErrorMessage } from '../../shared/api/errors';

const TIME_FORMAT = 'HH:mm';
const DATE_FORMAT = 'YYYY-MM-DD';

const WEEKDAYS = [
  { value: 1, label: 'Пн' },
  { value: 2, label: 'Вт' },
  { value: 3, label: 'Ср' },
  { value: 4, label: 'Чт' },
  { value: 5, label: 'Пт' },
  { value: 6, label: 'Сб' },
  { value: 7, label: 'Вс' },
];

interface Draft {
  start: Dayjs | null;
  end: Dayjs | null;
  workingDays: number[];
  holidays: string[];
}

/**
 * Рабочие часы для планирования визитов (см. план «Доработка календаря визитов»). Окна визита
 * нельзя предлагать/подтверждать вне этого расписания. Draft появляется только с первым
 * изменением — до этого значения берём прямо с сервера (derived-during-render, без эффекта).
 */
export function WorkingHoursPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['working-hours'], queryFn: fetchWorkingHours });

  const [draft, setDraft] = useState<Draft | null>(null);
  const start = draft ? draft.start : data ? dayjs(data.workdayStart, TIME_FORMAT) : null;
  const end = draft ? draft.end : data ? dayjs(data.workdayEnd, TIME_FORMAT) : null;
  const workingDays = draft ? draft.workingDays : (data?.workingDays ?? []);
  const holidays = draft ? draft.holidays : (data?.holidays ?? []);

  const setPartial = (patch: Partial<Draft>) => setDraft({ start, end, workingDays, holidays, ...patch });

  const saveMutation = useMutation({
    mutationFn: (values: Partial<WorkingHours>) => updateWorkingHours(values),
    onSuccess: () => {
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ['working-hours'] });
      message.success('Настройки сохранены');
    },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось сохранить настройки')),
  });

  const handleSave = () => {
    if (!start || !end) {
      message.error('Укажите начало и конец рабочего дня');
      return;
    }
    if (!end.isAfter(start)) {
      message.error('Конец рабочего дня должен быть позже начала');
      return;
    }
    if (workingDays.length === 0) {
      message.error('Отметьте хотя бы один рабочий день недели');
      return;
    }
    saveMutation.mutate({
      workdayStart: start.format(TIME_FORMAT),
      workdayEnd: end.format(TIME_FORMAT),
      workingDays: [...workingDays].sort((a, b) => a - b),
      holidays,
    });
  };

  const addHoliday = (d: Dayjs | null) => {
    if (!d) return;
    const key = d.format(DATE_FORMAT);
    if (holidays.includes(key)) return;
    setPartial({ holidays: [...holidays, key].sort() });
  };

  return (
    <Card title="Рабочие часы визитов" loading={isLoading} style={{ maxWidth: 720 }}>
      <Typography.Paragraph type="secondary">
        Окна визита системного администратора можно предлагать и подтверждать только в рабочее время:
        в пределах рабочего дня, по рабочим дням недели и не в отмеченные нерабочими даты.
      </Typography.Paragraph>

      <Form layout="vertical">
        <Space size="large" wrap>
          <Form.Item label="Начало рабочего дня" required>
            <TimePicker value={start} onChange={(v) => setPartial({ start: v })} format={TIME_FORMAT} minuteStep={15} />
          </Form.Item>
          <Form.Item label="Конец рабочего дня" required>
            <TimePicker value={end} onChange={(v) => setPartial({ end: v })} format={TIME_FORMAT} minuteStep={15} />
          </Form.Item>
        </Space>

        <Form.Item label="Рабочие дни недели" required>
          <Checkbox.Group
            options={WEEKDAYS}
            value={workingDays}
            onChange={(v) => setPartial({ workingDays: v as number[] })}
          />
        </Form.Item>

        <Form.Item label="Нерабочие даты (праздники, выходные)">
          <Space direction="vertical" style={{ display: 'flex' }}>
            <DatePicker
              placeholder="Добавить дату"
              format={DATE_FORMAT}
              value={null}
              onChange={addHoliday}
              disabledDate={(d) => holidays.includes(d.format(DATE_FORMAT))}
            />
            <Space wrap>
              {holidays.length === 0 && <Typography.Text type="secondary">Список пуст</Typography.Text>}
              {holidays.map((h) => (
                <Tag key={h} closable onClose={() => setPartial({ holidays: holidays.filter((x) => x !== h) })}>
                  {dayjs(h).format('DD.MM.YYYY')}
                </Tag>
              ))}
            </Space>
          </Space>
        </Form.Item>

        <Button type="primary" loading={saveMutation.isPending} onClick={handleSave}>
          Сохранить
        </Button>
      </Form>
    </Card>
  );
}
