import { shortTicketNumber } from '../../shared/ticket-number';
import { Button, Card, Empty, Grid, Input, Pagination, Segmented, Select, Space, Spin, Table, Tag, Typography, App as AntdApp, theme } from 'antd';
import { MobileTicketCard } from '../../shared/components/MobileTicketCard';
import type { TableProps } from 'antd';
import { CloseOutlined, FilePdfOutlined, FilterOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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
  const [filtersOpen, setFiltersOpen] = useState(false);
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

  const handleTableChange: TableProps<Ticket>['onChange'] = (_pagination, _filters, sorter, { action }) => {
    if (action !== 'sort') return;
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

  const reportButton = (
    <Button icon={<FilePdfOutlined />} loading={myReportMutation.isPending} onClick={() => myReportMutation.mutate()}>
      Справка о моих заявках
    </Button>
  );
  const createButton = <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/tickets/new')}>Новая заявка</Button>;

  const titleContent = (
    <Space wrap size="middle">
      {isMobile ? title : <Typography.Title level={1}>{title}</Typography.Title>}
      {data && <Typography.Text type="secondary" style={{ fontWeight: 400 }}>({data.total})</Typography.Text>}
      {activeFilterChip && (
        <Tag closable onClose={() => setUrlParams({})} icon={<CloseOutlined />}>{activeFilterChip}</Tag>
      )}
    </Space>
  );
  const filters = (
    <>
      <Input.Search
        allowClear
        placeholder="Поиск по номеру, тексту, автору"
        style={{ width: 240 }}
        onSearch={(v) => { setSearch(v); setPage(1); }}
      />
      {isMobile && <Button icon={<FilterOutlined />} onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen}>{filtersOpen ? 'Скрыть фильтры' : `Фильтры${status || tagId || view !== 'all' ? ' · включены' : ''}`}</Button>}
      {(!isMobile || filtersOpen) && (
        <>
          {isStaffUi && (
            <Segmented
              value={view}
              onChange={(value) => { setView(value as ViewFilter); setPage(1); }}
              options={[{ label: 'Все', value: 'all' }, { label: 'Просроченные', value: 'overdue' }]}
            />
          )}
          <Select
            allowClear
            placeholder="Статус"
            style={{ width: 160 }}
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
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
          {isMobile && reportButton}
          {isMobile && (
            <Select
              aria-label="Порядок заявок"
              value={`${sort.sortBy}:${sort.sortOrder}`}
              onChange={(value) => {
                const [field, order] = value.split(':');
                setSort({ sortBy: field as TicketSortField, sortOrder: order as 'asc' | 'desc' });
                setPage(1);
              }}
              options={[
                { value: 'createdAt:desc', label: 'Сначала новые' },
                { value: 'createdAt:asc', label: 'Сначала старые' },
                ...(isStaff ? [{ value: 'priority:desc', label: 'Сначала высокий приоритет' }] : []),
              ]}
            />
          )}
        </>
      )}
    </>
  );

  return (
    <>
      {!isMobile && (
        <div className="tickets-heading">
          {titleContent}
          <div className="tickets-heading-actions">{reportButton}{createButton}</div>
        </div>
      )}
      <Card
        className="tickets-page"
        styles={{ header: { paddingBlock: 16 }, title: { whiteSpace: 'normal', overflow: 'visible' } }}
        title={isMobile ? titleContent : undefined}
        extra={isMobile ? <Space wrap size="middle">{filters}{createButton}</Space> : undefined}
      >
        {!isMobile && <div className="tickets-toolbar">{filters}</div>}
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

        {isMobile ? (
          <Spin spinning={isLoading}>
            <div className="mobile-ticket-list">
              {(data?.items ?? []).map((ticket) => <MobileTicketCard key={ticket.id} ticket={ticket} showPriority={isStaff} />)}
              {!isLoading && !data?.items.length && <Empty description="Заявок не найдено. Измените поиск или создайте новую." image={Empty.PRESENTED_IMAGE_SIMPLE} />}
            </div>
            <Pagination simple current={page} pageSize={20} total={data?.total ?? 0} onChange={setPage} hideOnSinglePage showSizeChanger={false} style={{ justifyContent: 'center', marginTop: 20 }} />
            {isStaff && <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>Откройте заявку, чтобы назначить исполнителя или изменить статус.</Typography.Paragraph>}
          </Spin>
        ) : <Table<Ticket>
          className="desktop-ticket-table"
          size="small"
          rowKey="id"
          loading={isLoading}
          scroll={{ x: isStaffUi ? 950 : 690 }}
          tableLayout="fixed"
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
          pagination={{ current: page, pageSize: 20, total: data?.total ?? 0, onChange: setPage, showSizeChanger: false, hideOnSinglePage: true }}
          columns={[
            {
              title: '№', key: 'number', width: 74, sorter: true,
              render: (_, t) => (
                <Link to={`/tickets/${t.id}`} style={{ color: token.colorPrimaryText, fontWeight: 600 }} onClick={(event) => event.stopPropagation()}>
                  {shortTicketNumber(t.number)}
                </Link>
              ),
            },
            {
              title: 'Описание и кабинет',
              render: (_, t) => (
                <div className="ticket-table-cell">
                  <Typography.Text strong className="ticket-table-preview" title={t.description}>{t.description}</Typography.Text>
                  <Typography.Text type="secondary" className="ticket-table-muted">{t.location.building}, каб. {t.location.room}</Typography.Text>
                </div>
              ),
            },
            {
              title: 'Категория',
              width: 134,
              render: (_, t) => (
                <div className="ticket-table-cell">
                  {t.category
                    ? <Typography.Text className="ticket-table-preview" title={t.category.name}>{t.category.name}</Typography.Text>
                    : <Typography.Text type="secondary">не задана</Typography.Text>}
                  {t.tags.length > 0 && (
                    <div className="ticket-table-tags">
                      {t.tags.map((tag) => <Tag key={tag.id} color={tag.color ?? undefined} title={tag.name}>{tag.name}</Tag>)}
                    </div>
                  )}
                </div>
              ),
            },
            ...(isStaffUi
              ? [
                  {
                    title: 'Приоритет',
                    key: 'priority',
                    width: 112,
                    sorter: true,
                    render: (_: unknown, t: Ticket) => (t.priority ? <Tag color={PRIORITY_COLORS[t.priority]}>{PRIORITY_LABELS[t.priority]}</Tag> : '—'),
                  },
                ]
              : []),
            {
              title: 'Статус',
              key: 'status',
              width: 110,
              sorter: true,
              render: (_, t) => <Tag color={STATUS_COLORS[t.status]}>{STATUS_LABELS[t.status]}</Tag>,
            },
            {
              title: 'Исполнитель',
              width: 140,
              render: (_, t) => (
                <div className="ticket-table-cell">
                  <Typography.Text>{t.assignedTo?.fullName ?? 'Не назначен'}</Typography.Text>
                  <Typography.Text type="secondary" className="ticket-table-muted">Автор: {t.createdBy.fullName}</Typography.Text>
                </div>
              ),
            },
            ...(isStaffUi
              ? [
                  {
                    title: 'SLA (реакция)',
                    key: 'responseDueAt',
                    width: 112,
                    sorter: true,
                    render: (_: unknown, t: Ticket) => <SlaCountdown dueAt={t.responseDueAt} breached={t.isResponseBreached} doneAt={t.firstRespondedAt} />,
                  },
                ]
              : []),
            {
              title: 'Создана',
              key: 'createdAt',
              width: 100,
              sorter: true,
              defaultSortOrder: 'descend',
              render: (_, t) => (
                <div className="ticket-table-cell">
                  <span>{dayjs(t.createdAt).format('DD.MM.YYYY')}</span>
                  <Typography.Text type="secondary" className="ticket-table-muted">{dayjs(t.createdAt).format('HH:mm')}</Typography.Text>
                </div>
              ),
            },
          ]}
        />}
      </Card>
    </>
  );
}
