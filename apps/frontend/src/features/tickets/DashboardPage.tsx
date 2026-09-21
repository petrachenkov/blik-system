import { Card, Checkbox, Col, Empty, List, Row, Space, Table, Tag, Typography, App as AntdApp, theme } from 'antd';
import {
  CalendarOutlined,
  CarryOutOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  InboxOutlined,
  RedoOutlined,
  StarOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { fetchMyDay, type MyDayTask, type MyDayVisit } from '../../shared/api/visits';
import { updateCalendarTask } from '../../shared/api/calendarTasks';
import { SlaCountdown } from '../../shared/components/SlaCountdown';
import { STATUS_COLORS, STATUS_LABELS, PRIORITY_COLORS, PRIORITY_LABELS } from '../../shared/labels';
import { extractErrorMessage } from '../../shared/api/errors';
import type { Ticket } from '../../shared/types';

function loc(l: MyDayVisit['ticket']['location']) {
  return `${l.building}, каб. ${l.room}${l.label ? ` (${l.label})` : ''}`;
}

type Tone = 'neutral' | 'good' | 'warn' | 'bad';

function StatTile({
  icon,
  value,
  label,
  tone = 'neutral',
  onClick,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  tone?: Tone;
  onClick?: () => void;
}) {
  const { token } = theme.useToken();
  const toneColor = { neutral: token.colorPrimary, good: token.colorSuccess, warn: token.colorWarning, bad: token.colorError }[tone];
  const toneBg = { neutral: token.colorPrimaryBg, good: token.colorSuccessBg, warn: token.colorWarningBg, bad: token.colorErrorBg }[tone];
  return (
    <Card size="small" style={{ borderInlineStart: `3px solid ${toneColor}`, cursor: onClick ? 'pointer' : undefined }} onClick={onClick}>
      <Space align="start" size={12}>
        <div
          style={{
            width: 36,
            height: 36,
            flexShrink: 0,
            borderRadius: 8,
            background: toneBg,
            color: toneColor,
            fontSize: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.15 }}>{value}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{label}</Typography.Text>
        </div>
      </Space>
    </Card>
  );
}

function ratingTone(rating: number | null): Tone {
  if (rating == null) return 'neutral';
  if (rating >= 4.5) return 'good';
  if (rating >= 3.5) return 'warn';
  return 'bad';
}

function countTone(n: number, invert = false): Tone {
  // invert: 0 = хорошо (нечего горит/переоткрыто), >0 = плохо. По умолчанию — наоборот (нейтрально).
  if (!invert) return n > 0 ? 'warn' : 'neutral';
  return n > 0 ? 'bad' : 'good';
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = AntdApp.useApp();
  const { data, isLoading } = useQuery({ queryKey: ['my-day'], queryFn: fetchMyDay, refetchInterval: 60_000 });

  const taskToggle = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => updateCalendarTask(id, { done }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-day'] });
      void queryClient.invalidateQueries({ queryKey: ['calendar-tasks'] });
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Не удалось изменить задачу')),
  });

  const visitList = (visits: MyDayVisit[], showDate: boolean) => (
    <List
      size="small"
      dataSource={visits}
      renderItem={(v) => (
        <List.Item style={{ cursor: 'pointer' }} onClick={() => navigate(`/tickets/${v.ticket.id}`)}>
          <List.Item.Meta
            title={
              <Space>
                <Tag color="green">
                  {v.scheduledStart
                    ? dayjs(v.scheduledStart).format(showDate ? 'DD.MM HH:mm' : 'HH:mm') +
                      (v.scheduledEnd ? `–${dayjs(v.scheduledEnd).format('HH:mm')}` : '')
                    : '—'}
                </Tag>
                <span>{v.ticket.number}</span>
              </Space>
            }
            description={
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {loc(v.ticket.location)} · {v.ticket.createdBy?.fullName ?? '—'}
              </Typography.Text>
            }
          />
        </List.Item>
      )}
    />
  );

  const taskList = (tasks: MyDayTask[]) => (
    <List
      size="small"
      dataSource={tasks}
      renderItem={(t) => (
        <List.Item>
          <Space wrap size="middle">
            <Checkbox checked={t.done} onChange={(e) => taskToggle.mutate({ id: t.id, done: e.target.checked })} />
            <Tag color="default">
              {dayjs(t.start).format('DD.MM HH:mm')}–{dayjs(t.end).format('HH:mm')}
            </Tag>
            <span
              style={{ textDecoration: t.done ? 'line-through' : undefined, cursor: t.ticket ? 'pointer' : undefined }}
              onClick={() => t.ticket && navigate(`/tickets/${t.ticket.id}`)}
            >
              {t.title}
            </span>
            {t.ticket && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t.ticket.number}</Typography.Text>}
          </Space>
        </List.Item>
      )}
    />
  );

  const ticketTable = (tickets: Ticket[], variant: 'sla' | 'priority' | 'plain') => (
    <Table<Ticket>
      rowKey="id"
      size="small"
      pagination={false}
      dataSource={tickets}
      scroll={{ x: 'max-content' }}
      onRow={(r) => ({ onClick: () => navigate(`/tickets/${r.id}`), style: { cursor: 'pointer' } })}
      columns={[
        { title: '№', dataIndex: 'number', width: 120 },
        { title: 'Кабинет', render: (_, t) => `${t.location.building}, каб. ${t.location.room}` },
        { title: 'Описание', dataIndex: 'description', ellipsis: true },
        ...(variant === 'priority'
          ? [{
              title: 'Приоритет',
              width: 110,
              render: (_: unknown, t: Ticket) =>
                t.priority ? <Tag color={PRIORITY_COLORS[t.priority]}>{PRIORITY_LABELS[t.priority]}</Tag> : '—',
            }]
          : []),
        { title: 'Статус', width: 130, render: (_, t) => <Tag color={STATUS_COLORS[t.status]}>{STATUS_LABELS[t.status]}</Tag> },
        ...(variant === 'sla'
          ? [{
              title: 'SLA',
              width: 170,
              render: (_: unknown, t: Ticket) => (
                <Space direction="vertical" size={2}>
                  <SlaCountdown dueAt={t.responseDueAt} breached={t.isResponseBreached} doneAt={t.firstRespondedAt} />
                  <SlaCountdown dueAt={t.resolutionDueAt} breached={t.isResolutionBreached} doneAt={t.resolvedAt} />
                </Space>
              ),
            }]
          : []),
      ]}
    />
  );

  const nothing =
    data &&
    !data.myOpenTickets.length &&
    !data.slaToday.length &&
    !data.slaWeek.length &&
    !data.reopened.length &&
    !data.visitsToday.length &&
    !data.visitsUpcoming.length &&
    !data.pendingVisits.length &&
    !data.tasksToday.length &&
    !data.tasksUpcoming.length;

  return (
    <Space direction="vertical" size="large" style={{ display: 'flex' }}>
      <Typography.Title level={3} style={{ margin: 0 }}>Главная</Typography.Title>

      {isLoading && <Card loading />}

      {data && (
        <Row gutter={[12, 12]}>
          <Col xs={12} sm={8} md={4}>
            <StatTile
              icon={<InboxOutlined />}
              value={data.myOpenTickets.length}
              label="В работе"
              tone="neutral"
              onClick={data.myOpenTickets.length > 0 ? () => scrollToSection('sec-my-open') : undefined}
            />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <StatTile
              icon={<WarningOutlined />}
              value={data.slaToday.length}
              label="Дедлайны сегодня"
              tone={countTone(data.slaToday.length, true)}
              onClick={data.slaToday.length > 0 ? () => scrollToSection('sec-sla-today') : undefined}
            />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <StatTile
              icon={<ClockCircleOutlined />}
              value={data.slaWeek.length}
              label="Дедлайны на неделе"
              tone={countTone(data.slaWeek.length)}
              onClick={data.slaWeek.length > 0 ? () => scrollToSection('sec-sla-week') : undefined}
            />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <StatTile
              icon={<RedoOutlined />}
              value={data.reopened.length}
              label="Переоткрыто"
              tone={countTone(data.reopened.length, true)}
              onClick={data.reopened.length > 0 ? () => scrollToSection('sec-reopened') : undefined}
            />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <StatTile icon={<CheckCircleOutlined />} value={data.weekStats.resolved} label="Закрыто за неделю" tone="good" />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <StatTile
              icon={<StarOutlined />}
              value={data.weekStats.avgRating != null ? data.weekStats.avgRating.toFixed(1) : '—'}
              label="Оценка за неделю"
              tone={ratingTone(data.weekStats.avgRating)}
            />
          </Col>
        </Row>
      )}

      {nothing && (
        <Card>
          <Empty description="Всё спокойно — открытых заявок, горящих дедлайнов и визитов нет" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      )}

      {data && data.myOpenTickets.length > 0 && (
        <Card id="sec-my-open" title={<Space><InboxOutlined /> Мои заявки в работе ({data.myOpenTickets.length})</Space>}>
          {ticketTable(data.myOpenTickets, 'priority')}
        </Card>
      )}

      {data && data.slaToday.length > 0 && (
        <Card id="sec-sla-today" title={<Space><WarningOutlined /> Дедлайны сегодня ({data.slaToday.length})</Space>}>
          {ticketTable(data.slaToday, 'sla')}
        </Card>
      )}

      {data && data.slaWeek.length > 0 && (
        <Card id="sec-sla-week" title={<Space><ClockCircleOutlined /> Дедлайны на этой неделе ({data.slaWeek.length})</Space>}>
          {ticketTable(data.slaWeek, 'sla')}
        </Card>
      )}

      {data && data.reopened.length > 0 && (
        <Card id="sec-reopened" title={<Space><RedoOutlined /> Переоткрытые ({data.reopened.length})</Space>}>
          {ticketTable(data.reopened, 'plain')}
        </Card>
      )}

      {data && data.visitsToday.length > 0 && (
        <Card title={<Space><CalendarOutlined /> Визиты сегодня</Space>}>{visitList(data.visitsToday, false)}</Card>
      )}

      {data && data.tasksToday.length > 0 && (
        <Card title={<Space><CarryOutOutlined /> Задачи на сегодня ({data.tasksToday.filter((t) => !t.done).length})</Space>}>
          {taskList(data.tasksToday)}
        </Card>
      )}

      {data && data.visitsUpcoming.length > 0 && (
        <Card title={<Space><CalendarOutlined /> Ближайшие визиты</Space>}>{visitList(data.visitsUpcoming, true)}</Card>
      )}

      {data && data.tasksUpcoming.length > 0 && (
        <Card title={<Space><CarryOutOutlined /> Ближайшие задачи</Space>}>{taskList(data.tasksUpcoming)}</Card>
      )}

      {data && data.pendingVisits.length > 0 && (
        <Card title={<Space><ClockCircleOutlined /> Ждут подтверждения заявителя ({data.pendingVisits.length})</Space>}>
          <List
            size="small"
            dataSource={data.pendingVisits}
            renderItem={(v) => (
              <List.Item style={{ cursor: 'pointer' }} onClick={() => navigate(`/tickets/${v.ticket.id}`)}>
                <List.Item.Meta
                  title={<Space><span>{v.ticket.number}</span><Tag>предложено окон: {v.slots.length}</Tag></Space>}
                  description={
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {loc(v.ticket.location)} · {v.ticket.createdBy?.fullName ?? '—'}
                    </Typography.Text>
                  }
                />
              </List.Item>
            )}
          />
        </Card>
      )}
    </Space>
  );
}
