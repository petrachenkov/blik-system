import { Card, Table, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { fetchCartridges } from '../../shared/api/cartridges';
import type { CartridgeRequest } from '../../shared/types';

/**
 * Заправленные картриджи намеренно убраны из основной вкладки «Картриджи» (см. фидбэк —
 * они там только мешают исполнителям искать активные заявки). Здесь — их архив для справки.
 */
export function CartridgeArchivePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['cartridges', { status: 'FILLED' }],
    queryFn: () => fetchCartridges({ status: 'FILLED', pageSize: 100 }),
  });

  return (
    <Card title="Архив заправленных картриджей">
      <Typography.Paragraph type="secondary">
        Картриджи, которые уже вернулись с заправки и разнесены по кабинетам.
      </Typography.Paragraph>
      <Table<CartridgeRequest>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items ?? []}
        pagination={{ pageSize: 20, total: data?.total ?? 0 }}
        scroll={{ x: 'max-content' }}
        columns={[
          { title: '№', dataIndex: 'number', width: 130 },
          { title: 'Код', dataIndex: 'code' },
          { title: 'Локация', render: (_, r) => `${r.location.building}, каб. ${r.location.room}` },
          { title: 'Преподаватель', render: (_, r) => r.createdBy.fullName },
          { title: 'Забрал', render: (_, r) => r.collectedBy?.fullName ?? '—' },
          { title: 'Отчёт', render: (_, r) => r.report?.number ?? '—' },
          { title: 'Заправлен', dataIndex: 'filledAt', render: (v: string | null) => (v ? dayjs(v).format('DD.MM.YYYY HH:mm') : '—') },
        ]}
      />
    </Card>
  );
}
