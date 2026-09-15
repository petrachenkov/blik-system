import { useState } from 'react';
import { Button, Card, Col, DatePicker, Rate, Row, Space, Table, Tag, Typography, App as AntdApp, theme } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Dayjs } from 'dayjs';
import { downloadAssigneeStatsReport, fetchAssigneeStats } from '../../shared/api/tickets';
import { ROLE_LABELS } from '../../shared/labels';
import { extractErrorMessage } from '../../shared/api/errors';
import { HorizontalBarChart } from '../../shared/charts/HorizontalBarChart';
import type { AssigneeStats } from '../../shared/types';

const { RangePicker } = DatePicker;

function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '—';
  const totalMinutes = Math.round(minutes);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins} мин`;
  if (hours < 24) return `${hours} ч ${mins} мин`;
  return `${Math.floor(hours / 24)} дн ${hours % 24} ч`;
}

/** "Кто, что и как" — полноценная статистика по исполнителям, не просто счётчик (см. план). */
export function AssigneeStatsPage() {
  const { token } = theme.useToken();
  const { message } = AntdApp.useApp();
  // null — за всё время (по умолчанию, поведение не изменилось). Выбрав диапазон, сисадмин
  // сам ограничивает и графики/таблицу на экране, и документ на скачивание одним и тем же
  // периодом — см. план "Отчёт по статистике за период".
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const period = range ? { from: range[0].startOf('day').toISOString(), to: range[1].endOf('day').toISOString() } : undefined;

  const { data = [], isLoading } = useQuery({
    queryKey: ['assignee-stats', period],
    queryFn: () => fetchAssigneeStats(period),
  });

  const downloadMutation = useMutation({
    mutationFn: () => downloadAssigneeStatsReport(period),
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось скачать отчёт')),
  });

  // Единый порядок исполнителей для всех графиков — так один и тот же человек стоит
  // на одной и той же строке во всех карточках, и их проще сопоставлять между собой.
  const sorted = [...data].sort((a, b) => b.openCount - a.openCount);
  const categories = sorted.map((s) => s.fullName);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card size="small">
        <Space wrap size={12}>
          <RangePicker value={range} onChange={(v) => setRange(v && v[0] && v[1] ? [v[0], v[1]] : null)} format="DD.MM.YYYY" allowClear placeholder={['С даты', 'По дату']} />
          {range && <Typography.Link onClick={() => setRange(null)}>За всё время</Typography.Link>}
          <Button icon={<DownloadOutlined />} loading={downloadMutation.isPending} onClick={() => downloadMutation.mutate()}>
            Скачать отчёт (.xlsx)
          </Button>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Текущая нагрузка" size="small">
            <HorizontalBarChart
              categories={categories}
              formatValue={(v) => String(v)}
              integerAxis
              series={[
                {
                  key: 'open',
                  label: 'Открыто сейчас',
                  color: token.colorSuccess,
                  values: sorted.map((s) => s.openCount),
                  colors: sorted.map((s) => (s.openCount > 7 ? token.colorError : s.openCount > 3 ? token.colorWarning : token.colorSuccess)),
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Решено и отклонено" size="small">
            <HorizontalBarChart
              categories={categories}
              formatValue={(v) => String(v)}
              integerAxis
              series={[
                { key: 'resolved', label: 'Решено/закрыто', color: token.colorSuccess, values: sorted.map((s) => s.resolvedCount) },
                { key: 'rejected', label: 'Отклонено', color: token.colorError, values: sorted.map((s) => s.rejectedCount) },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Среднее время реакции" size="small">
            <HorizontalBarChart
              categories={categories}
              formatValue={(v) => formatMinutes(v)}
              series={[
                { key: 'response', label: 'Среднее время реакции', color: token.colorPrimary, values: sorted.map((s) => s.avgResponseMinutes) },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Среднее время решения" size="small">
            <HorizontalBarChart
              categories={categories}
              formatValue={(v) => formatMinutes(v)}
              series={[
                { key: 'resolution', label: 'Среднее время решения', color: '#722ed1', values: sorted.map((s) => s.avgResolutionMinutes) },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Статистика исполнителей">
        <Table<AssigneeStats>
          rowKey="userId"
          loading={isLoading}
          dataSource={sorted}
          pagination={false}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Исполнитель', dataIndex: 'fullName', fixed: 'left' as const },
            { title: 'Роль', dataIndex: 'role', render: (role: AssigneeStats['role']) => ROLE_LABELS[role] },
            {
              title: 'Нагрузка',
              children: [
                {
                  title: 'Открыто сейчас',
                  dataIndex: 'openCount',
                  sorter: (a, b) => a.openCount - b.openCount,
                  render: (v: number) => <Tag color={v > 7 ? 'red' : v > 3 ? 'gold' : 'green'}>{v}</Tag>,
                },
                { title: 'Всего назначено', dataIndex: 'totalAssignedCount', sorter: (a, b) => a.totalAssignedCount - b.totalAssignedCount },
              ],
            },
            {
              title: 'Результат',
              children: [
                { title: 'Решено/закрыто', dataIndex: 'resolvedCount', sorter: (a, b) => a.resolvedCount - b.resolvedCount },
                {
                  title: 'Отклонено',
                  dataIndex: 'rejectedCount',
                  sorter: (a, b) => a.rejectedCount - b.rejectedCount,
                  render: (v: number) => (v > 0 ? <Tag color="red">{v}</Tag> : v),
                },
              ],
            },
            {
              title: 'Просрочки SLA',
              children: [
                {
                  title: 'Реакция',
                  dataIndex: 'responseBreachedCount',
                  sorter: (a, b) => a.responseBreachedCount - b.responseBreachedCount,
                  render: (v: number) => (v > 0 ? <Tag color="red">{v}</Tag> : v),
                },
                {
                  title: 'Решение',
                  dataIndex: 'resolutionBreachedCount',
                  sorter: (a, b) => a.resolutionBreachedCount - b.resolutionBreachedCount,
                  render: (v: number) => (v > 0 ? <Tag color="red">{v}</Tag> : v),
                },
              ],
            },
            {
              title: 'Среднее время',
              children: [
                {
                  title: 'Реакция',
                  dataIndex: 'avgResponseMinutes',
                  sorter: (a, b) => (a.avgResponseMinutes ?? -1) - (b.avgResponseMinutes ?? -1),
                  render: formatMinutes,
                },
                {
                  title: 'Решение',
                  dataIndex: 'avgResolutionMinutes',
                  sorter: (a, b) => (a.avgResolutionMinutes ?? -1) - (b.avgResolutionMinutes ?? -1),
                  render: formatMinutes,
                },
              ],
            },
            {
              title: 'Средняя оценка',
              dataIndex: 'avgRating',
              sorter: (a, b) => (a.avgRating ?? 0) - (b.avgRating ?? 0),
              render: (v: number | null) =>
                v === null ? (
                  '—'
                ) : (
                  <Space size={6}>
                    <Rate disabled allowHalf value={v} style={{ fontSize: 14 }} />
                    <Typography.Text
                      style={{ color: v >= 4.5 ? token.colorSuccess : v >= 3.5 ? token.colorWarning : token.colorError }}
                    >
                      {v.toFixed(1)}
                    </Typography.Text>
                  </Space>
                ),
            },
          ]}
          summary={(rows) => {
            const sum = (f: (s: AssigneeStats) => number) => rows.reduce((acc, s) => acc + f(s), 0);
            const avg = (f: (s: AssigneeStats) => number | null) => {
              const vals = rows.map(f).filter((v): v is number => v !== null);
              return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
            };
            const avgRating = avg((s) => s.avgRating);
            return (
              <Table.Summary fixed>
                <Table.Summary.Row style={{ fontWeight: 600, background: token.colorFillAlter }}>
                  <Table.Summary.Cell index={0} colSpan={2}>
                    Итого / в среднем по отделу
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2}>{sum((s) => s.openCount)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={3}>{sum((s) => s.totalAssignedCount)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={4}>{sum((s) => s.resolvedCount)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={5}>{sum((s) => s.rejectedCount)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={6}>{sum((s) => s.responseBreachedCount)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={7}>{sum((s) => s.resolutionBreachedCount)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={8}>{formatMinutes(avg((s) => s.avgResponseMinutes))}</Table.Summary.Cell>
                  <Table.Summary.Cell index={9}>{formatMinutes(avg((s) => s.avgResolutionMinutes))}</Table.Summary.Cell>
                  <Table.Summary.Cell index={10}>{avgRating === null ? '—' : avgRating.toFixed(1)}</Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            );
          }}
        />
      </Card>
    </div>
  );
}
