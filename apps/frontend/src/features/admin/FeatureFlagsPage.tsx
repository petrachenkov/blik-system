import { Alert, Button, Card, Input, Popconfirm, Space, Switch, Table, Tag, Typography, App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useState } from 'react';
import { fetchAdminFlags, updateFlag, type AdminFlag } from '../../shared/api/system';
import { extractErrorMessage } from '../../shared/api/errors';

export function FeatureFlagsPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ['system', 'flags', 'admin'], queryFn: fetchAdminFlags });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['system', 'flags'] });
  };

  const mutation = useMutation({
    mutationFn: ({ key, enabled, note }: { key: string; enabled: boolean; note?: string | null }) =>
      updateFlag(key, { enabled, note }),
    onSuccess: () => {
      invalidate();
      message.success('Сохранено');
    },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось сохранить')),
  });

  const maintenance = data.find((f) => f.isMaintenance);
  const features = data.filter((f) => !f.isMaintenance);

  return (
    <Space direction="vertical" size="large" style={{ display: 'flex', maxWidth: 900 }}>
      {maintenance && <MaintenanceCard flag={maintenance} onSave={(enabled, note) => mutation.mutate({ key: maintenance.key, enabled, note })} pending={mutation.isPending} />}

      <Card title="Флаги функциональности" loading={isLoading}>
        <Typography.Paragraph type="secondary">
          Выключенная фича перестаёт работать и на сервере, и в интерфейсе — изменения применяются в течение минуты, без перезапуска.
        </Typography.Paragraph>
        <Table<AdminFlag>
          rowKey="key"
          dataSource={features}
          pagination={false}
          columns={[
            {
              title: 'Фича',
              render: (_, r) => (
                <div>
                  <div style={{ fontWeight: 600 }}>{r.label}</div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.description}</Typography.Text>
                </div>
              ),
            },
            {
              title: 'Вкл.',
              width: 80,
              render: (_, r) => (
                <Switch
                  checked={r.enabled}
                  loading={mutation.isPending}
                  onChange={(enabled) => mutation.mutate({ key: r.key, enabled, note: r.note })}
                />
              ),
            },
            {
              title: 'Пометка',
              width: 260,
              render: (_, r) => <NoteInput value={r.note} onSave={(note) => mutation.mutate({ key: r.key, enabled: r.enabled, note })} />,
            },
            {
              title: 'Изменено',
              width: 170,
              render: (_, r) =>
                r.updatedAt ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {dayjs(r.updatedAt).format('DD.MM HH:mm')}
                    {r.updatedByName ? `, ${r.updatedByName}` : ''}
                  </Typography.Text>
                ) : (
                  '—'
                ),
            },
          ]}
        />
      </Card>
    </Space>
  );
}

function MaintenanceCard({ flag, onSave, pending }: { flag: AdminFlag; onSave: (enabled: boolean, note: string | null) => void; pending: boolean }) {
  const [note, setNote] = useState(flag.note ?? '');
  return (
    <Card title="Режим обслуживания" styles={{ header: { background: flag.enabled ? '#fff1f0' : undefined } }}>
      {flag.enabled && (
        <Alert type="error" showIcon style={{ marginBottom: 12 }} message="Режим обслуживания включён — вход для всех, кроме Главного сисадмина, закрыт." />
      )}
      <Typography.Paragraph type="secondary">
        Показывает всем красный баннер и блокирует вход/продление сессии для не-админов. Уже вошедшие сотрудники дорабатывают текущую сессию.
      </Typography.Paragraph>
      <Input.TextArea
        rows={2}
        placeholder="Текст баннера, например: Идут плановые работы, вход будет открыт после 18:00"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      <Space wrap size="middle">
        {flag.enabled ? (
          <Popconfirm title="Выключить режим обслуживания?" onConfirm={() => onSave(false, note || null)} okText="Выключить" cancelText="Отмена">
            <Button danger loading={pending}>Выключить режим обслуживания</Button>
          </Popconfirm>
        ) : (
          <Popconfirm
            title="Включить режим обслуживания?"
            description="Не-админы не смогут войти и продлить сессию."
            onConfirm={() => onSave(true, note || null)}
            okText="Включить"
            cancelText="Отмена"
          >
            <Button danger type="primary" loading={pending}>Включить режим обслуживания</Button>
          </Popconfirm>
        )}
        <Button onClick={() => onSave(flag.enabled, note || null)} loading={pending}>Сохранить только текст</Button>
        <Tag color={flag.enabled ? 'red' : 'default'}>{flag.enabled ? 'включён' : 'выключен'}</Tag>
      </Space>
    </Card>
  );
}

function NoteInput({ value, onSave }: { value: string | null; onSave: (note: string | null) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const current = draft ?? value ?? '';
  return (
    <Input
      size="small"
      placeholder="—"
      value={current}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== (value ?? '')) onSave(draft || null);
        setDraft(null);
      }}
    />
  );
}
