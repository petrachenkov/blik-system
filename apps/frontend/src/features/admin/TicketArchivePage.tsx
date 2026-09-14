import { useState } from 'react';
import { Button, Card, InputNumber, Space, Switch, Table, Tag, Typography, App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { fetchTicketRetention, updateTicketRetention } from '../../shared/api/system';
import { fetchTickets, setTicketArchived } from '../../shared/api/tickets';
import { STATUS_COLORS, STATUS_LABELS } from '../../shared/labels';
import { extractErrorMessage } from '../../shared/api/errors';
import type { Ticket } from '../../shared/types';

/** Политика хранения + просмотр архива заявок (см. план «Архив заявок»). */
export function TicketArchivePage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: retention, isLoading: retLoading } = useQuery({
    queryKey: ['ticket-retention'],
    queryFn: fetchTicketRetention,
  });
  const [draft, setDraft] = useState<{ enabled: boolean; archiveClosedAfterDays: number } | null>(null);
  const enabled = draft ? draft.enabled : (retention?.enabled ?? false);
  const days = draft ? draft.archiveClosedAfterDays : (retention?.archiveClosedAfterDays ?? 180);

  const saveMutation = useMutation({
    mutationFn: () => updateTicketRetention({ enabled, archiveClosedAfterDays: days }),
    onSuccess: () => {
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ['ticket-retention'] });
      message.success('Настройки сохранены');
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Не удалось сохранить')),
  });

  const { data: archived, isLoading: listLoading } = useQuery({
    queryKey: ['tickets', { archived: true }],
    queryFn: () => fetchTickets({ archived: true, pageSize: 50, sortBy: 'createdAt', sortOrder: 'desc' }),
  });

  const unarchiveMutation = useMutation({
    mutationFn: (id: string) => setTicketArchived(id, false),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
      message.success('Заявка возвращена из архива');
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Не удалось вернуть заявку')),
  });

  return (
    <Space direction="vertical" size="large" style={{ display: 'flex' }}>
      <Card title="Политика хранения заявок" loading={retLoading} style={{ maxWidth: 640 }}>
        <Typography.Paragraph type="secondary">
          Закрытые и отклонённые заявки старше указанного срока автоматически уходят в архив: они
          скрываются из списков, но данные не удаляются. Проверка — раз в сутки ночью.
        </Typography.Paragraph>
        <Space size="large" wrap>
          <Space>
            <Switch checked={enabled} onChange={(v) => setDraft({ enabled: v, archiveClosedAfterDays: days })} />
            <span>Включить автоархив</span>
          </Space>
          <Space>
            <span>Архивировать через</span>
            <InputNumber
              min={7}
              max={3650}
              value={days}
              disabled={!enabled}
              onChange={(v) => setDraft({ enabled, archiveClosedAfterDays: v ?? days })}
            />
            <span>дней после закрытия</span>
          </Space>
        </Space>
        <div style={{ marginTop: 16 }}>
          <Button type="primary" loading={saveMutation.isPending} disabled={!draft} onClick={() => saveMutation.mutate()}>
            Сохранить
          </Button>
        </div>
      </Card>

      <Card title={`Архив заявок${archived ? ` (${archived.total})` : ''}`}>
        <Table<Ticket>
          rowKey="id"
          size="small"
          loading={listLoading}
          dataSource={archived?.items ?? []}
          pagination={false}
          onRow={(r) => ({ onClick: () => navigate(`/tickets/${r.id}`), style: { cursor: 'pointer' } })}
          columns={[
            { title: '№', dataIndex: 'number', width: 120 },
            { title: 'Кабинет', render: (_, t) => `${t.location.building}, каб. ${t.location.room}` },
            { title: 'Описание', dataIndex: 'description', ellipsis: true },
            { title: 'Статус', width: 120, render: (_, t) => <Tag color={STATUS_COLORS[t.status]}>{STATUS_LABELS[t.status]}</Tag> },
            { title: 'В архиве с', width: 130, render: (_, t) => (t.archivedAt ? dayjs(t.archivedAt).format('DD.MM.YYYY') : '—') },
            {
              title: '',
              width: 160,
              render: (_, t) => (
                <Button
                  size="small"
                  loading={unarchiveMutation.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    unarchiveMutation.mutate(t.id);
                  }}
                >
                  Вернуть из архива
                </Button>
              ),
            },
          ]}
        />
      </Card>
    </Space>
  );
}
