import { Button, Card, Grid, Input, Segmented, Select, Space, Table, Tag, Tooltip, Typography, App as AntdApp, theme } from 'antd';
import type { TableProps } from 'antd';
import { CloseOutlined, FilePdfOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import {
  bulkTicketAction,
  downloadMyTicketsReport,
  fetchTickets,
  type BulkTicketAction,
  type TicketSortField,
} from '../../shared/api/tickets';
import { fetchTags } from '../../shared/api/tags';
import { fetchStaffDirectory } from '../../shared/api/catalogs';
import { extractErrorMessage } from '../../shared/api/errors';
import { useAuth } from '../../shared/auth/AuthContext';
import { PRIORITY_COLORS, PRIORITY_LABELS, ROLE_LABELS, STATUS_COLORS, STATUS_LABELS, isStaffRole } from '../../shared/labels';
import { SlaCountdown } from '../../shared/components/SlaCountdown';
import type { Ticket, TicketStatus } from '../../shared/types';
import dayjs from 'dayjs';

type ViewFilter = 'all' | 'overdue';

const SORT_FIELD_BY_COLUMN_KEY: Record<string, TicketSortField> = {
  number: 'number',
  priority: 'priority',
  status: 'status',
  responseDueAt: 'responseDueAt',
  createdAt: 'createdAt',
};

const BULK_ACTIONS: { value: BulkTicketAction; label: string }[] = [
  { value: 'assign', label: 'Назначить исполнителя' },
  { value: 'status', label: 'Сменить статус' },
  { value: 'addTags', label: 'Добавить тег' },
  { value: 'removeTags', label: 'Убрать тег' },
  { value: 'archive', label: 'В архив' },
];

export function TicketsListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = AntdApp.useApp();
  const { token } = theme.useToken();
  const isMobile = !Grid.useBreakpoint().lg;
  const [urlParams, setUrlParams] = useSearchParams();

  const assigneeId = urlParams.get('assigneeId') ?? undefined;
  const locationId = urlParams.get('locationId') ?? undefined;

  const myReportMutation = useMutation({
    mutationFn: downloadMyTicketsReport,
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось скачать справку')),
  });
  const [status, setStatus] = useState<TicketStatus | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [tagId, setTagId] = useState<string | undefined>(undefined);
  const [view, setView] = useState<ViewFilter>('all');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<BulkTicketAction | undefined>(undefined);
  const [bulkParam, setBulkParam] = useState<string | undefined>(undefined);

  const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: () => fetchTags() });
  const isStaff = isStaffRole(user?.role ?? 'USER');
  const { data: staff = [] } = useQuery({ queryKey: ['staff-directory'], queryFn: fetchStaffDirectory, enabled: isStaff });

  const [sort, setSort] = useState<{ sortBy: TicketSortField; sortOrder: 'asc' | 'desc' }>({
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', { status, search, tagId, assigneeId, locationId, overdue: view === 'overdue', page, ...sort }],
    queryFn: () =>
      fetchTickets({
        status,
        search: search || undefined,
        tagId,
        assigneeId,
        locationId,
        overdue: view === 'overdue' || undefined,
        page,
        pageSize: 20,
        ...sort,
      }),
  });

  const title =
    user?.role === 'INTERN' ? 'Мои заявки' : user?.role === 'USER' ? 'Мои заявки' : 'Заявки';
  const isStaffUi = isStaff;

  const bulkMutation = useMutation({
    mutationFn: () => {
      if (!bulkAction) throw new Error('Не выбрано действие');
      return bulkTicketAction({
        ids: selectedIds,
        action: bulkAction,
        assigneeId: bulkAction === 'assign' ? bulkParam : undefined,
        status: bulkAction === 'status' ? (bulkParam as TicketStatus) : undefined,
        tagIds: bulkAction === 'addTags' || bulkAction === 'removeTags' ? (bulkParam ? [bulkParam] : []) : undefined,
        archived: bulkAction === 'archive' ? true : undefined,
      });
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setSelectedIds([]);
      setBulkAction(undefined);
      setBulkParam(undefined);
      if (res.failed === 0) {
        message.success(`Готово: ${res.succeeded}`);
      } else {
        const bad = res.results.filter((r) => !r.ok).slice(0, 3).map((r) => r.error).join('; ');
        message.warning(`Готово: ${res.succeeded} · пропущено: ${res.failed}${bad ? ` (${bad})` : ''}`);
      }
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Не удалось выполнить операцию')),
  });

  const bulkParamNeeded = bulkAction === 'assign' || bulkAction === 'status' || bulkAction === 'addTags' || bulkAction === 'removeTags';
  const canRunBulk = Boolean(bulkAction) && (!bulkParamNeeded || Boolean(bulkParam));

  const handleTableChange: TableProps<Ticket>['onChange'] = (_pagination, _filters, sorter) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    const field = typeof s?.columnKey === 'string' ? SORT_FIELD_BY_COLUMN_KEY[s.columnKey] : undefined;
    if (field && s?.order) {
      setSort({ sortBy: field, sortOrder: s.order === 'ascend' ? 'asc' : 'desc' });
    } else {
      setSort({ sortBy: 'createdAt', sortOrder: 'desc' });
    }
    setPage(1);
  };

  const activeFilterChip = useMemo(() => {
    if (assigneeId) {
      const u = staff.find((s) => s.id === assigneeId);
      return `Исполнитель: ${u?.fullName ?? assigneeId}`;
    }
    if (locationId) {
      const t = data?.items.find((i) => i.location.id === locationId);
      return `Кабинет: ${t ? `${t.location.building}, каб. ${t.location.room}` : locationId}`;
    }
    return null;
  }, [assigneeId, locationId, staff, data]);

  return (
    <Card
      // У .ant-card-head в antd по умолчанию padding-top: 0 (вертикальное центрирование через
      // min-height, а не паддинг) — нормально смотрится в одну строку, но когда title/extra
      // переносятся на несколько строк на мобильном (Space wrap), первая строка оказывается
      // прижата к верхней границе карточки (см. фидбэк — "нет отступов от границ до полей").
      // title у antd Card по умолчанию white-space: nowrap + text-overflow: ellipsis — перебивает
      // Space wrap внутри (см. тот же фикс и его причину в TicketDetailPage.tsx).
      styles={{ header: { paddingBlock: 16 }, title: { whiteSpace: 'normal', overflow: 'visible' } }}
      title={
        <Space wrap size="middle">
          {title}
          {data && <Typography.Text type="secondary" style={{ fontWeight: 400 }}>({data.total})</Typography.Text>}
          {activeFilterChip && (
            <Tag closable onClose={() => setUrlParams({})} icon={<CloseOutlined />}>
              {activeFilterChip}
            </Tag>
          )}
        </Space>
      }
      extra={
        // size="middle" вместо дефолтного small — на мобильном контролы переносятся по одной
        // на строку (Space wrap), и с 8px дефолтного зазора выглядели слишком плотно друг к
        // другу (см. фидбэк со скриншотом).
        <Space wrap size="middle">
          <Input.Search
            allowClear
            placeholder="Поиск по номеру, тексту, автору"
            style={{ width: 240 }}
            onSearch={(v) => { setSearch(v); setPage(1); }}
          />
          {isStaffUi && (
            <Segmented value={view} onChange={(v) => setView(v as ViewFilter)} options={[{ label: 'Все', value: 'all' }, { label: 'Просроченные', value: 'overdue' }]} />
          )}
          <Select
            allowClear
            placeholder="Статус"
            style={{ width: 160 }}
            value={status}
            onChange={setStatus}
            options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          />
          {tags.length > 0 && (
            <Select
              allowClear
              placeholder="Тег"
              style={{ width: 150 }}
              value={tagId}
              onChange={(v) => { setTagId(v); setPage(1); }}
              options={tags.map((t) => ({ value: t.id, label: <Tag color={t.color ?? undefined}>{t.name}</Tag> }))}
            />
          )}
          <Tooltip title={isMobile ? 'Справка о моих заявках' : undefined}>
            <Button icon={<FilePdfOutlined />} loading={myReportMutation.isPending} onClick={() => myReportMutation.mutate()}>
              {!isMobile && 'Справка о моих заявках'}
            </Button>
          </Tooltip>
          <Button type="primary" onClick={() => navigate('/tickets/new')}>Новая заявка</Button>
        </Space>
      }
    >
      {isStaffUi && selectedIds.length > 0 && (
        <Space wrap style={{ marginBottom: 12, padding: 8, background: token.colorFillQuaternary, borderRadius: token.borderRadius }}>
          <Typography.Text strong>Выбрано: {selectedIds.length}</Typography.Text>
          <Select
            placeholder="Действие"
            style={{ width: 200 }}
            value={bulkAction}
            onChange={(v) => { setBulkAction(v); setBulkParam(undefined); }}
            options={BULK_ACTIONS}
          />
          {bulkAction === 'assign' && (
            <Select
              showSearch
              placeholder="Исполнитель"
              style={{ width: 200 }}
              optionFilterProp="label"
              value={bulkParam}
              onChange={setBulkParam}
              options={staff.map((s) => ({ value: s.id, label: `${s.fullName} · ${ROLE_LABELS[s.role]}` }))}
            />
          )}
          {bulkAction === 'status' && (
            <Select
              placeholder="Новый статус"
              style={{ width: 160 }}
              value={bulkParam}
              onChange={setBulkParam}
              options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
            />
          )}
          {(bulkAction === 'addTags' || bulkAction === 'removeTags') && (
            <Select
              placeholder="Тег"
              style={{ width: 160 }}
              value={bulkParam}
              onChange={setBulkParam}
              options={tags.map((t) => ({ value: t.id, label: t.name }))}
            />
          )}
          <Button type="primary" disabled={!canRunBulk} loading={bulkMutation.isPending} onClick={() => bulkMutation.mutate()}>
            Применить
          </Button>
          <Button onClick={() => { setSelectedIds([]); setBulkAction(undefined); setBulkParam(undefined); }}>Снять выделение</Button>
        </Space>
      )}

      <Table<Ticket>
        rowKey="id"
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        dataSource={data?.items ?? []}
        rowSelection={
          isStaffUi
            ? { selectedRowKeys: selectedIds, onChange: (keys) => setSelectedIds(keys as string[]), preserveSelectedRowKeys: true }
            : undefined
        }
        onRow={(record) => ({
          onClick: () => navigate(`/tickets/${record.id}`),
          style: {
            cursor: 'pointer',
            background: isStaffUi && (record.isResponseBreached || record.isResolutionBreached) ? token.colorErrorBg : undefined,
          },
        })}
        onChange={handleTableChange}
        pagination={{ current: page, pageSize: 20, total: data?.total ?? 0, onChange: setPage }}
        columns={[
          { title: '№', dataIndex: 'number', key: 'number', width: 130, sorter: true },
          { title: 'Локация', render: (_, t) => `${t.location.building}, каб. ${t.location.room}` },
          { title: 'Описание', dataIndex: 'description', ellipsis: true },
          {
            title: 'Категория',
            render: (_, t) => (
              <Space size={4} wrap>
                {t.category ? t.category.name : <Typography.Text type="secondary">не задана</Typography.Text>}
                {t.tags.map((tag) => (
                  <Tag key={tag.id} color={tag.color ?? undefined} style={{ marginInlineEnd: 0 }}>
                    {tag.name}
                  </Tag>
                ))}
              </Space>
            ),
          },
          ...(isStaffUi
            ? [
                {
                  title: 'Приоритет',
                  key: 'priority',
                  sorter: true,
                  render: (_: unknown, t: Ticket) => (t.priority ? <Tag color={PRIORITY_COLORS[t.priority]}>{PRIORITY_LABELS[t.priority]}</Tag> : '—'),
                },
              ]
            : []),
          {
            title: 'Статус',
            key: 'status',
            sorter: true,
            render: (_, t) => <Tag color={STATUS_COLORS[t.status]}>{STATUS_LABELS[t.status]}</Tag>,
          },
          { title: 'Создал', render: (_, t) => t.createdBy.fullName },
          {
            title: 'Исполнитель',
            render: (_, t) => t.assignedTo?.fullName ?? <Typography.Text type="secondary">не назначен</Typography.Text>,
          },
          ...(isStaffUi
            ? [
                {
                  title: 'SLA (реакция)',
                  key: 'responseDueAt',
                  sorter: true,
                  render: (_: unknown, t: Ticket) => <SlaCountdown dueAt={t.responseDueAt} breached={t.isResponseBreached} doneAt={t.firstRespondedAt} />,
                },
              ]
            : []),
          {
            title: 'Создана',
            key: 'createdAt',
            sorter: true,
            defaultSortOrder: 'descend',
            render: (_, t) => dayjs(t.createdAt).format('DD.MM.YYYY HH:mm'),
          },
        ]}
      />
    </Card>
  );
}
