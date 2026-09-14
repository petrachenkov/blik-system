import { Button, Card, Form, Space, Switch, TimePicker, Typography, App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { fetchQuietHours, updateQuietHours } from '../../shared/api/notifications';
import { extractErrorMessage } from '../../shared/api/errors';

const TIME_FORMAT = 'HH:mm';

interface Draft {
  enabled: boolean;
  start: Dayjs | null;
  end: Dayjs | null;
}

/** Тихие часы уведомлений — глобальное окно, отложенная доставка push/мессенджера (см. план).
 * IN_APP (колокольчик) не откладывается — уведомление всё равно сразу видно в списке. */
export function QuietHoursPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['quiet-hours'], queryFn: fetchQuietHours });

  // Пока пользователь ничего не менял — берём значения с сервера напрямую (derived-during-render,
  // без эффекта): draft появляется только с первым реальным изменением в форме.
  const [draft, setDraft] = useState<Draft | null>(null);
  const enabled = draft ? draft.enabled : Boolean(data?.quietHoursStart && data?.quietHoursEnd);
  const start = draft ? draft.start : data?.quietHoursStart ? dayjs(data.quietHoursStart, TIME_FORMAT) : null;
  const end = draft ? draft.end : data?.quietHoursEnd ? dayjs(data.quietHoursEnd, TIME_FORMAT) : null;

  const setPartial = (patch: Partial<Draft>) => setDraft({ enabled, start, end, ...patch });

  const saveMutation = useMutation({
    mutationFn: (values: { start: string | null; end: string | null }) => updateQuietHours(values),
    onSuccess: () => {
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ['quiet-hours'] });
      message.success('Настройки сохранены');
    },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось сохранить настройки')),
  });

  const handleSave = () => {
    if (enabled && (!start || !end)) {
      message.error('Укажите начало и конец периода');
      return;
    }
    saveMutation.mutate({
      start: enabled ? start!.format(TIME_FORMAT) : null,
      end: enabled ? end!.format(TIME_FORMAT) : null,
    });
  };

  return (
    <Card title="Тихие часы уведомлений" loading={isLoading} style={{ maxWidth: 640 }}>
      <Typography.Paragraph type="secondary">
        В указанный период push-уведомления браузера (и в будущем — мессенджер) не отправляются сразу, а
        приходят, как только период закончится. Уведомление в колокольчике при этом появляется как обычно —
        откладывается только пуш.
      </Typography.Paragraph>

      <Form layout="vertical">
        <Form.Item label="Включить тихие часы">
          <Switch checked={enabled} onChange={(v) => setPartial({ enabled: v })} />
        </Form.Item>

        {enabled && (
          <Space size="large">
            <Form.Item label="Начало" required>
              <TimePicker value={start} onChange={(v) => setPartial({ start: v })} format={TIME_FORMAT} />
            </Form.Item>
            <Form.Item label="Конец" required>
              <TimePicker value={end} onChange={(v) => setPartial({ end: v })} format={TIME_FORMAT} />
            </Form.Item>
          </Space>
        )}

        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          Можно указать период через полночь (например, 22:00–08:00).
        </Typography.Paragraph>

        <Button type="primary" loading={saveMutation.isPending} onClick={handleSave}>
          Сохранить
        </Button>
      </Form>
    </Card>
  );
}
