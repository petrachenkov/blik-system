import { shortTicketNumber } from '../../shared/ticket-number';
import { ResponsiveTable as Table } from '../../shared/components/ResponsiveTable';
import { Card, Typography } from 'antd';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useState } from 'react';
import { fetchCartridges } from '../../shared/api/cartridges';
import type { CartridgeRequest } from '../../shared/types';

/**
 * Заправленные картриджи намеренно убраны из основной вкладки «Картриджи» (см. фидбэк —
 * они там только мешают исполнителям искать активные заявки). Здесь — их архив для справки.
 */
export function CartridgeArchivePage() {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: ['cartridges', { status: 'FILLED', page, pageSize }],
    queryFn: () => fetchCartridges({ status: 'FILLED', page, pageSize }),
    placeholderData: keepPreviousData,
  });

  return (
    <Card title="Архив заправленных картриджей">
      <Typography.Paragraph type="secondary">
        Картриджи, которые уже вернулись с заправки и разнесены по кабинетам.
      </Typography.Paragraph>
      <Table<CartridgeRequest>
        rowKey="id"
        loading={isLoading || isPlaceholderData}
        dataSource={isPlaceholderData ? [] : data?.items}
        pagination={{ current: page, pageSize, total: data?.total ?? 0, showSizeChanger: false, onChange: setPage }}
        scroll={{ x: 'max-content' }}
        columns={[
          { title: '№', dataIndex: 'number', render: (value: string) => shortTicketNumber(value), width: 130 },
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
