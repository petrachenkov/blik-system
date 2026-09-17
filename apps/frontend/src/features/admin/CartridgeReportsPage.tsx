import { Button, Card, Popconfirm, Space, Table, Tag, Typography, App as AntdApp } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import dayjs from 'dayjs';
import { fetchCartridges } from '../../shared/api/cartridges';
import { closeCartridgeReport, downloadCartridgeReport, fetchCartridgeReports, generateCartridgeReport } from '../../shared/api/cartridgeReports';
import { extractErrorMessage } from '../../shared/api/errors';
import { CARTRIDGE_REPORT_STATUS_COLORS, CARTRIDGE_REPORT_STATUS_LABELS } from '../../shared/labels';
import type { CartridgeReport, CartridgeRequest } from '../../shared/types';

export function CartridgeReportsPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: collected, isLoading: collectedLoading } = useQuery({
    queryKey: ['cartridges', { status: 'COLLECTED' }],
    queryFn: () => fetchCartridges({ status: 'COLLECTED', pageSize: 100 }),
  });

  const { data: reports = [], isLoading: reportsLoading } = useQuery({
    queryKey: ['cartridge-reports'],
    queryFn: fetchCartridgeReports,
  });

  const generateMutation = useMutation({
    mutationFn: (requestIds: string[]) => generateCartridgeReport(requestIds),
    onSuccess: () => {
      setSelectedIds([]);
      void queryClient.invalidateQueries({ queryKey: ['cartridges'] });
      void queryClient.invalidateQueries({ queryKey: ['cartridge-reports'] });
      message.success('Отчёт сформирован');
    },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось сформировать отчёт')),
  });

  const closeMutation = useMutation({
    mutationFn: (id: string) => closeCartridgeReport(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cartridges'] });
      void queryClient.invalidateQueries({ queryKey: ['cartridge-reports'] });
      message.success('Отчёт закрыт, заявки заправлены');
    },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось закрыть отчёт')),
  });

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title="Собранные картриджи, ждущие отчёта">
        <Typography.Paragraph type="secondary">
          Отметьте картриджи, которые едут на эту заправку, и сформируйте отчёт — Excel-файл сразу сохранится в архив ниже.
        </Typography.Paragraph>
        <Space style={{ marginBottom: 12 }}>
          <Button
            type="primary"
            disabled={selectedIds.length === 0}
            loading={generateMutation.isPending}
            onClick={() => generateMutation.mutate(selectedIds)}
          >
            Сформировать отчёт ({selectedIds.length})
          </Button>
        </Space>
        <Table<CartridgeRequest>
          rowKey="id"
          loading={collectedLoading}
          dataSource={collected?.items ?? []}
          pagination={false}
          rowSelection={{ selectedRowKeys: selectedIds, onChange: (keys) => setSelectedIds(keys as string[]) }}
          columns={[
            { title: 'Код', dataIndex: 'code' },
            { title: 'Локация', render: (_, r) => `${r.location.building}, каб. ${r.location.room}` },
            { title: 'Преподаватель', render: (_, r) => r.createdBy.fullName },
            { title: 'Забрал', render: (_, r) => r.collectedBy?.fullName ?? '—' },
            { title: 'Забран', dataIndex: 'collectedAt', render: (v: string | null) => (v ? dayjs(v).format('DD.MM.YYYY HH:mm') : '—') },
          ]}
        />
      </Card>

      <Card title="Архив отчётов">
        <Table<CartridgeReport>
          rowKey="id"
          loading={reportsLoading}
          dataSource={reports}
          columns={[
            { title: '№', dataIndex: 'number' },
            { title: 'Картриджей', render: (_, r) => r._count.requests },
            {
              title: 'Прибыло с заправки',
              render: (_, r) => (
                <Tag color={r.arrivedCount === r._count.requests ? 'green' : 'default'}>
                  {r.arrivedCount} / {r._count.requests}
                </Tag>
              ),
            },
            {
              title: 'Статус',
              render: (_, r) => <Tag color={CARTRIDGE_REPORT_STATUS_COLORS[r.status]}>{CARTRIDGE_REPORT_STATUS_LABELS[r.status]}</Tag>,
            },
            { title: 'Сформирован', dataIndex: 'createdAt', render: (v: string) => dayjs(v).format('DD.MM.YYYY HH:mm') },
            { title: 'Кем', render: (_, r) => r.createdBy.fullName },
            { title: 'Закрыт', dataIndex: 'closedAt', render: (v: string | null) => (v ? dayjs(v).format('DD.MM.YYYY HH:mm') : '—') },
            {
              title: '',
              render: (_, r) => (
                <Space>
                  <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadCartridgeReport(r.id, r.filename)}>
                    Скачать
                  </Button>
                  {r.status === 'GENERATED' && (
                    <Popconfirm
                      title="Закрыть отчёт?"
                      description="Картриджи уже разнесены по кабинетам — все заявки этого отчёта перейдут в статус «Заправлен»."
                      onConfirm={() => closeMutation.mutate(r.id)}
                      okText="Закрыть"
                      cancelText="Отмена"
                    >
                      <Button size="small" type="primary" loading={closeMutation.isPending}>
                        Закрыть отчёт
                      </Button>
                    </Popconfirm>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Card>
    </Space>
  );
}
