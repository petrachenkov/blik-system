import { Button, Card, InputNumber, Space, Table, Typography, App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSlaConfigs, updateSlaConfig } from '../../shared/api/catalogs';
import { PRIORITY_LABELS } from '../../shared/labels';
import type { SlaConfig, TicketPriority } from '../../shared/types';
import { useState } from 'react';

function minutesToHuman(minutes: number) {
  if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)} дн.`;
  if (minutes % 60 === 0) return `${minutes / 60} ч.`;
  return `${minutes} мин.`;
}

export function SlaConfigPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ['sla-configs'], queryFn: fetchSlaConfigs });
  const [editing, setEditing] = useState<TicketPriority | null>(null);
  const [draft, setDraft] = useState<{ responseMinutes: number; resolutionMinutes: number }>({
    responseMinutes: 0,
    resolutionMinutes: 0,
  });

  const mutation = useMutation({
    mutationFn: (data: { priority: TicketPriority; responseMinutes: number; resolutionMinutes: number }) =>
      updateSlaConfig(data.priority, { responseMinutes: data.responseMinutes, resolutionMinutes: data.resolutionMinutes }),
    onSuccess: () => {
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['sla-configs'] });
      message.success('SLA-настройки обновлены');
    },
    onError: () => message.error('Не удалось обновить настройки'),
  });

  const startEdit = (record: SlaConfig) => {
    setEditing(record.priority);
    setDraft({ responseMinutes: record.responseMinutes, resolutionMinutes: record.resolutionMinutes });
  };

  return (
    <Card title="Настройки SLA">
      <Typography.Paragraph type="secondary">
        Сроки реакции и решения по каждому приоритету. Изменение действует для заявок, классифицированных после сохранения.
      </Typography.Paragraph>
      <Table
        rowKey="priority"
        loading={isLoading}
        dataSource={data}
        pagination={false}
        columns={[
          { title: 'Приоритет', dataIndex: 'priority', render: (p) => PRIORITY_LABELS[p as TicketPriority] },
          {
            title: 'Срок реакции',
            render: (_, record) =>
              editing === record.priority ? (
                <InputNumber
                  min={1}
                  addonAfter="мин"
                  value={draft.responseMinutes}
                  onChange={(v) => setDraft((d) => ({ ...d, responseMinutes: v ?? 1 }))}
                />
              ) : (
                minutesToHuman(record.responseMinutes)
              ),
          },
          {
            title: 'Срок решения',
            render: (_, record) =>
              editing === record.priority ? (
                <InputNumber
                  min={1}
                  addonAfter="мин"
                  value={draft.resolutionMinutes}
                  onChange={(v) => setDraft((d) => ({ ...d, resolutionMinutes: v ?? 1 }))}
                />
              ) : (
                minutesToHuman(record.resolutionMinutes)
              ),
          },
          {
            title: '',
            render: (_, record) =>
              editing === record.priority ? (
                <Space>
                  <Button
                    type="primary"
                    size="small"
                    loading={mutation.isPending}
                    onClick={() => mutation.mutate({ priority: record.priority, ...draft })}
                  >
                    Сохранить
                  </Button>
                  <Button size="small" onClick={() => setEditing(null)}>Отмена</Button>
                </Space>
              ) : (
                <Button size="small" onClick={() => startEdit(record)}>Изменить</Button>
              ),
          },
        ]}
      />
    </Card>
  );
}
