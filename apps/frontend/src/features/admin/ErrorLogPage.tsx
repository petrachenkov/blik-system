import { Button, Card, Checkbox, Drawer, Grid, Space, Table, Tag, Typography, App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useState } from 'react';
import { fetchErrorLogs, resolveErrorLog, type ErrorLogEntry } from '../../shared/api/errorLog';
import { extractErrorMessage } from '../../shared/api/errors';

export function ErrorLogPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const isMobile = !Grid.useBreakpoint().lg;
  const [includeResolved, setIncludeResolved] = useState(false);
  const [selected, setSelected] = useState<ErrorLogEntry | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ['system', 'errors', includeResolved],
    queryFn: () => fetchErrorLogs(includeResolved),
  });

  const resolveMutation = useMutation({
    mutationFn: resolveErrorLog,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['system', 'errors'] });
      setSelected(null);
      message.success('Отмечено как решённое');
    },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось')),
  });

  return (
    <Card
      styles={{ header: { paddingBlock: 16 } }}
      title="Журнал ошибок"
      extra={<Checkbox checked={includeResolved} onChange={(e) => setIncludeResolved(e.target.checked)}>Показывать решённые</Checkbox>}
    >
      <Table<ErrorLogEntry>
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        pagination={{ pageSize: 30 }}
        scroll={{ x: 'max-content' }}
        onRow={(record) => ({ onClick: () => setSelected(record), style: { cursor: 'pointer' } })}
        columns={[
          {
            title: 'Где',
            dataIndex: 'source',
            width: 90,
            render: (v: string) => <Tag color={v === 'BACKEND' ? 'volcano' : 'geekblue'}>{v === 'BACKEND' ? 'Сервер' : 'Интерфейс'}</Tag>,
          },
          { title: 'Сообщение', dataIndex: 'message', ellipsis: true },
          { title: 'Раз', dataIndex: 'count', width: 60 },
          {
            title: 'Последний раз',
            dataIndex: 'lastSeenAt',
            width: 150,
            render: (v: string) => dayjs(v).format('DD.MM HH:mm:ss'),
          },
          {
            title: 'Статус',
            width: 110,
            render: (_, r) => (r.resolvedAt ? <Tag color="green">решено</Tag> : <Tag color="red">открыто</Tag>),
          },
        ]}
      />

      <Drawer
        title={selected ? `Ошибка (${selected.source === 'BACKEND' ? 'сервер' : 'интерфейс'})` : ''}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        width={isMobile ? '100%' : 720}
        extra={
          selected && !selected.resolvedAt ? (
            <Button type="primary" loading={resolveMutation.isPending} onClick={() => resolveMutation.mutate(selected.id)}>
              Пометить решённым
            </Button>
          ) : null
        }
      >
        {selected && (
          <Space direction="vertical" size="middle" style={{ display: 'flex' }}>
            <div>
              <Typography.Text strong>{selected.message}</Typography.Text>
            </div>
            <Typography.Text type="secondary">
              Впервые {dayjs(selected.firstSeenAt).format('DD.MM.YYYY HH:mm')} · всего раз: {selected.count}
              {selected.route ? ` · ${selected.method ?? ''} ${selected.route}` : ''}
              {selected.statusCode ? ` · HTTP ${selected.statusCode}` : ''}
            </Typography.Text>
            {selected.user && <Typography.Text type="secondary">Пользователь: {selected.user.fullName}</Typography.Text>}
            {selected.userAgent && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{selected.userAgent}</Typography.Text>}
            {selected.stack && (
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, background: 'rgba(127,127,127,0.08)', padding: 12, borderRadius: 6, maxHeight: 400, overflow: 'auto' }}>
                {selected.stack}
              </pre>
            )}
          </Space>
        )}
      </Drawer>
    </Card>
  );
}
