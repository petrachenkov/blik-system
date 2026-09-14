import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App as AntdApp,
  Avatar,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Divider,
  Empty,
  Form,
  Input,
  Mentions,
  Popconfirm,
  Rate,
  Row,
  Select,
  Space,
  Tag,
  Timeline,
  Typography,
  Upload,
  theme,
} from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  ReadOutlined,
  SendOutlined,
  UploadOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import dayjs from 'dayjs';
import {
  addCollaborator,
  assignTicket,
  changeTicketStatus,
  classifyTicket,
  createTicketComment,
  deleteTicket,
  deleteTicketComment,
  downloadTicketReport,
  fetchTicket,
  fetchTicketAttachments,
  fetchTicketComments,
  fetchTicketHistory,
  rateTicket,
  removeCollaborator,
  updateTicketComment,
} from '../../shared/api/tickets';
import { fetchKnowledgeArticles } from '../../shared/api/knowledge';
import { fetchTextSnippets } from '../../shared/api/textSnippets';
import { AttachmentPreview } from '../../shared/components/AttachmentPreview';
import { KnowledgeArticleCard } from '../../shared/components/KnowledgeArticleCard';
import { fetchCategories, fetchStaffDirectory, fetchUsers } from '../../shared/api/catalogs';
import { useAuth } from '../../shared/auth/AuthContext';
import { extractErrorMessage } from '../../shared/api/errors';
import {
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  ROLE_COLORS,
  ROLE_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  STATUS_TRANSITIONS,
  isStaffRole,
} from '../../shared/labels';
import { SlaCountdown } from '../../shared/components/SlaCountdown';
import { useTicketRoomSocket } from '../../shared/hooks/useTicketRoomSocket';
import { useFeatureFlag } from '../../shared/flags/FeatureFlagsContext';
import { fetchTags, setTicketTags } from '../../shared/api/tags';
import { VisitBlock } from './VisitBlock';
import { TicketTasksBlock } from './TicketTasksBlock';
import type { TicketPriority, TicketStatus } from '../../shared/types';

const HISTORY_ACTION_LABELS: Record<string, string> = {
  CREATED: 'Заявка создана',
  ASSIGNED: 'Назначен исполнитель',
  REASSIGNED: 'Переназначена',
  UNASSIGNED: 'Снято назначение',
  CLASSIFIED: 'Классифицирована',
  STATUS_CHANGED: 'Изменён статус',
  COMMENTED: 'Комментарий',
  ATTACHMENT_ADDED: 'Добавлено вложение',
  REOPENED: 'Переоткрыта',
  RATED: 'Оценено заявителем',
  TAGGED: 'Изменены теги',
  VISIT_SCHEDULED: 'Назначен визит',
  VISIT_RESCHEDULED: 'Визит перенесён',
  VISIT_COMPLETED: 'Визит состоялся',
  COLLABORATOR_ADDED: 'Добавлен соисполнитель',
  COLLABORATOR_REMOVED: 'Убран соисполнитель',
};

const HISTORY_DOT_COLORS: Record<string, string> = {
  CREATED: 'blue',
  ASSIGNED: 'geekblue',
  REASSIGNED: 'geekblue',
  CLASSIFIED: 'purple',
  STATUS_CHANGED: 'gold',
  ATTACHMENT_ADDED: 'gray',
  REOPENED: 'red',
  RATED: 'gold',
  TAGGED: 'cyan',
  VISIT_SCHEDULED: 'green',
};

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const ticketId = id!;
  const { user } = useAuth();
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  const { token } = theme.useToken();
  const queryClient = useQueryClient();
  const [commentBody, setCommentBody] = useState('');
  const [commentFiles, setCommentFiles] = useState<UploadFile[]>([]);
  const [commentArticleIds, setCommentArticleIds] = useState<string[]>([]);
  const [commentIsInternal, setCommentIsInternal] = useState(false);
  const [commentMentionIds, setCommentMentionIds] = useState<string[]>([]);
  const [ratingValue, setRatingValue] = useState(0);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const canAttachArticles = isStaffRole(user?.role ?? 'USER');
  const mentionsEnabled = useFeatureFlag('mentions');
  const liveChatEnabled = useFeatureFlag('live_chat');
  const { typingUsers, notifyTyping } = useTicketRoomSocket(ticketId, liveChatEnabled);

  const ticketQuery = useQuery({ queryKey: ['tickets', ticketId], queryFn: () => fetchTicket(ticketId) });
  const commentsQuery = useQuery({ queryKey: ['tickets', ticketId, 'comments'], queryFn: () => fetchTicketComments(ticketId) });
  const attachmentsQuery = useQuery({ queryKey: ['tickets', ticketId, 'attachments'], queryFn: () => fetchTicketAttachments(ticketId) });
  const historyQuery = useQuery({ queryKey: ['tickets', ticketId, 'history'], queryFn: () => fetchTicketHistory(ticketId) });
  // includeInactive: true — иначе если категория была деактивирована после классификации
  // заявки, выпадающий список не найдёт её и покажет вместо названия голый id.
  const categoriesQuery = useQuery({ queryKey: ['categories', 'all'], queryFn: () => fetchCategories(true) });
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: () => fetchUsers(), enabled: user?.role === 'ADMIN' });
  // Полный список — фильтрация на клиенте через showSearch (см. ниже): для реального объёма
  // статей IT-отдела колледжа (десятки-сотни) это проще и отзывчивее серверного поиска.
  const knowledgeArticlesQuery = useQuery({
    queryKey: ['knowledge-articles', {}],
    queryFn: () => fetchKnowledgeArticles(),
    enabled: canAttachArticles,
  });
  // @Упоминания — только между сотрудниками (см. план "Упоминания").
  const staffDirectoryQuery = useQuery({
    queryKey: ['users', 'staff-directory'],
    queryFn: () => fetchStaffDirectory(),
    enabled: canAttachArticles,
  });
  const tagsQuery = useQuery({ queryKey: ['tags'], queryFn: () => fetchTags(), enabled: canAttachArticles });
  // Шаблоны быстрых ответов сисадмина (см. план) — управляются на /admin/text-snippets.
  const cannedResponsesQuery = useQuery({
    queryKey: ['text-snippets', 'CANNED_RESPONSE'],
    queryFn: () => fetchTextSnippets('CANNED_RESPONSE'),
    enabled: canAttachArticles,
  });

  const invalidateTicket = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tickets', ticketId] }),
      queryClient.invalidateQueries({ queryKey: ['tickets', ticketId, 'history'] }),
      queryClient.invalidateQueries({ queryKey: ['tickets'] }),
    ]);

  const assignMutation = useMutation({
    mutationFn: (assigneeId?: string) => assignTicket(ticketId, assigneeId),
    onSuccess: () => { void invalidateTicket(); message.success('Исполнитель назначен'); },
    onError: () => message.error('Не удалось назначить исполнителя'),
  });

  const classifyMutation = useMutation({
    mutationFn: (data: { categoryId: string; priority: TicketPriority }) => classifyTicket(ticketId, data),
    onSuccess: () => { void invalidateTicket(); message.success('Заявка классифицирована'); },
    onError: () => message.error('Не удалось классифицировать заявку'),
  });

  const statusMutation = useMutation({
    mutationFn: (status: TicketStatus) => changeTicketStatus(ticketId, status),
    onSuccess: () => { void invalidateTicket(); message.success('Статус обновлён'); },
    onError: () => message.error('Не удалось изменить статус'),
  });

  const addCollabMutation = useMutation({
    mutationFn: (userId: string) => addCollaborator(ticketId, userId),
    onSuccess: () => { void invalidateTicket(); message.success('Соисполнитель добавлен'); },
    onError: (e) => message.error(extractErrorMessage(e, 'Не удалось добавить соисполнителя')),
  });
  const removeCollabMutation = useMutation({
    mutationFn: (userId: string) => removeCollaborator(ticketId, userId),
    onSuccess: () => { void invalidateTicket(); message.success('Соисполнитель убран'); },
    onError: (e) => message.error(extractErrorMessage(e, 'Не удалось убрать соисполнителя')),
  });

  const tagsMutation = useMutation({
    mutationFn: (tagIds: string[]) => setTicketTags(ticketId, tagIds),
    onSuccess: () => { void invalidateTicket(); message.success('Теги обновлены'); },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось обновить теги')),
  });

  const commentMutation = useMutation({
    mutationFn: () =>
      createTicketComment(
        ticketId,
        commentBody,
        commentFiles.map((f) => f.originFileObj as File).filter(Boolean),
        commentArticleIds,
        commentIsInternal,
        commentMentionIds,
      ),
    onSuccess: () => {
      setCommentBody('');
      setCommentFiles([]);
      setCommentArticleIds([]);
      setCommentIsInternal(false);
      setCommentMentionIds([]);
      void queryClient.invalidateQueries({ queryKey: ['tickets', ticketId, 'comments'] });
    },
    onError: () => message.error('Не удалось отправить сообщение'),
  });

  const updateCommentMutation = useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) => updateTicketComment(ticketId, commentId, body),
    onSuccess: () => {
      setEditingCommentId(null);
      void queryClient.invalidateQueries({ queryKey: ['tickets', ticketId, 'comments'] });
    },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось сохранить изменения')),
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => deleteTicketComment(ticketId, commentId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tickets', ticketId, 'comments'] }),
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось удалить комментарий')),
  });

  const rateMutation = useMutation({
    mutationFn: (rating: number) => rateTicket(ticketId, rating),
    onSuccess: () => { void invalidateTicket(); message.success('Спасибо за оценку!'); },
    onError: () => message.error('Не удалось сохранить оценку'),
  });

  const reportMutation = useMutation({
    mutationFn: () => downloadTicketReport(ticketId, ticketQuery.data?.number ?? ticketId),
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось скачать справку')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTicket(ticketId),
    onSuccess: () => {
      message.success('Заявка удалена');
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
      navigate('/', { replace: true });
    },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось удалить заявку')),
  });

  if (ticketQuery.isLoading || !ticketQuery.data) return <Card loading />;
  const ticket = ticketQuery.data;

  const isCreator = user?.id === ticket.createdBy.id;
  const isAssignee = user?.id === ticket.assignedTo?.id;
  // Соисполнитель (см. план) — доступ к работе как у назначенного практиканта.
  const isCollaborator = ticket.collaborators.some((c) => c.userId === user?.id);
  const isWorker = isAssignee || isCollaborator;
  // Сисадмин (ADMIN) — полный доступ; практикант (INTERN) — только по назначенным/соисполняемым заявкам.
  const isAdmin = user?.role === 'ADMIN';
  const canSelfAssign = isAdmin && !ticket.assignedTo;
  const canClassify = isAdmin || (isWorker && user?.role === 'INTERN');
  const canActOnStatus = isAdmin || (isWorker && user?.role === 'INTERN');
  const canComment = isAdmin || isCreator || isWorker;
  const canManageCollaborators = isAdmin || isAssignee;
  const hasActions = canSelfAssign || isAdmin || canClassify || canActOnStatus;
  // Приоритет и SLA — рабочие метрики сисадминов, преподавателю не показываем (см. фидбэк).
  const isStaff = canAttachArticles;

  const nextStatuses = STATUS_TRANSITIONS[ticket.status] ?? [];
  const executorStatuses = nextStatuses.filter((s) => s !== 'REOPENED');
  // Переоткрыть может заявитель («не согласен с решением») или сисадмин (ошибочное закрытие).
  const canReopen = nextStatuses.includes('REOPENED') && (isCreator || isAdmin);

  return (
    <Row gutter={16}>
      <Col span={16}>
        <Card
          title={
            <Space wrap>
              <span>Заявка {ticket.number}</span>
              <Tag color={STATUS_COLORS[ticket.status]}>{STATUS_LABELS[ticket.status]}</Tag>
              {isStaff && ticket.priority && <Tag color={PRIORITY_COLORS[ticket.priority]}>{PRIORITY_LABELS[ticket.priority]}</Tag>}
              {isStaff && (ticket.isResponseBreached || ticket.isResolutionBreached) && <Tag color="red">Просрочена</Tag>}
            </Space>
          }
          extra={
            <Space>
              <Button icon={<FilePdfOutlined />} loading={reportMutation.isPending} onClick={() => reportMutation.mutate()}>
                Справка по заявке
              </Button>
              {user?.isMaster && (
                <Popconfirm
                  title={`Удалить заявку ${ticket.number}?`}
                  description="Действие необратимо: комментарии, вложения и история будут удалены безвозвратно."
                  okText="Удалить"
                  okButtonProps={{ danger: true }}
                  cancelText="Отмена"
                  onConfirm={() => deleteMutation.mutate()}
                >
                  <Button danger icon={<DeleteOutlined />} loading={deleteMutation.isPending}>
                    Удалить
                  </Button>
                </Popconfirm>
              )}
            </Space>
          }
        >
          <Descriptions column={2} bordered size="small" style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Локация">{ticket.location.building}, каб. {ticket.location.room}{ticket.location.label ? ` (${ticket.location.label})` : ''}</Descriptions.Item>
            <Descriptions.Item label="Преподаватель">{ticket.createdBy.fullName}</Descriptions.Item>
            <Descriptions.Item label="Категория">{ticket.category?.name ?? <Typography.Text type="secondary">не задана</Typography.Text>}</Descriptions.Item>
            <Descriptions.Item label="Исполнитель">{ticket.assignedTo?.fullName ?? <Typography.Text type="secondary">не назначен</Typography.Text>}</Descriptions.Item>
            {isStaff && (
              <Descriptions.Item label="SLA реакция">
                <SlaCountdown dueAt={ticket.responseDueAt} breached={ticket.isResponseBreached} doneAt={ticket.firstRespondedAt} />
              </Descriptions.Item>
            )}
            {isStaff && (
              <Descriptions.Item label="SLA решение">
                <SlaCountdown dueAt={ticket.resolutionDueAt} breached={ticket.isResolutionBreached} doneAt={ticket.resolvedAt} />
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Создана" span={2}>{dayjs(ticket.createdAt).format('DD.MM.YYYY HH:mm')}</Descriptions.Item>
          </Descriptions>

          <div style={{ marginBottom: 16 }}>
            <Space size={4} wrap align="center">
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>Теги:</Typography.Text>
              {ticket.tags.length === 0 && !isStaff && <Typography.Text type="secondary">нет</Typography.Text>}
              {ticket.tags.map((tag) => (
                <Tag key={tag.id} color={tag.color ?? undefined} style={{ marginInlineEnd: 0 }}>{tag.name}</Tag>
              ))}
              {isStaff && (
                <Select
                  mode="multiple"
                  size="small"
                  placeholder="изменить теги"
                  style={{ minWidth: 200 }}
                  loading={tagsMutation.isPending}
                  value={ticket.tags.map((t) => t.id)}
                  onChange={(ids) => tagsMutation.mutate(ids)}
                  options={(tagsQuery.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
                />
              )}
            </Space>
          </div>

          <Typography.Paragraph>
            <Typography.Text strong>Описание проблемы:</Typography.Text>
            <br />
            {ticket.description}
          </Typography.Paragraph>

          {attachmentsQuery.data && attachmentsQuery.data.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <Typography.Text strong>Вложения к заявке:</Typography.Text>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {attachmentsQuery.data.map((a) => (
                  <AttachmentPreview key={a.id} downloadUrl={`/tickets/${ticketId}/attachments/${a.id}`} attachment={a} />
                ))}
              </div>
            </div>
          )}

          <VisitBlock
            ticketId={ticketId}
            isCreator={isCreator}
            isStaff={isStaff}
            ticketStatus={ticket.status}
            assigneeId={ticket.assignedTo?.id ?? null}
          />

          <TicketTasksBlock ticketId={ticketId} isStaff={isStaff} ticketStatus={ticket.status} />

          {isStaff && (
            <div style={{ marginBottom: 16 }}>
              <Typography.Text strong>Соисполнители:</Typography.Text>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                {ticket.collaborators.length === 0 && !canManageCollaborators && (
                  <Typography.Text type="secondary">нет</Typography.Text>
                )}
                {ticket.collaborators.map((c) => (
                  <Tag
                    key={c.userId}
                    closable={canManageCollaborators || c.userId === user?.id}
                    onClose={(e) => { e.preventDefault(); removeCollabMutation.mutate(c.userId); }}
                    icon={<UserOutlined />}
                  >
                    {c.user.fullName}
                  </Tag>
                ))}
                {canManageCollaborators && (
                  <Select
                    showSearch
                    placeholder="Добавить соисполнителя"
                    style={{ minWidth: 220 }}
                    size="small"
                    value={null}
                    optionFilterProp="label"
                    loading={staffDirectoryQuery.isLoading}
                    onChange={(v) => v && addCollabMutation.mutate(v)}
                    options={(staffDirectoryQuery.data ?? [])
                      .filter(
                        (u) =>
                          (u.role === 'ADMIN' || u.role === 'INTERN') &&
                          u.id !== ticket.assignedTo?.id &&
                          u.id !== ticket.createdBy.id &&
                          !ticket.collaborators.some((c) => c.userId === u.id),
                      )
                      .map((u) => ({ value: u.id, label: `${u.fullName} · ${ROLE_LABELS[u.role]}` }))}
                  />
                )}
              </div>
            </div>
          )}

          {hasActions && (
            <>
              <Divider style={{ margin: '12px 0' }} />
              <Space orientation="vertical" style={{ width: '100%' }}>
                {canSelfAssign && (
                  <Button type="primary" onClick={() => assignMutation.mutate(undefined)} loading={assignMutation.isPending}>
                    Взять заявку в работу
                  </Button>
                )}

                {isAdmin && (
                  <Select
                    style={{ width: 280 }}
                    placeholder="Назначить / переназначить исполнителя"
                    loading={usersQuery.isLoading}
                    options={(usersQuery.data ?? [])
                      .filter((u) => u.role === 'ADMIN' || u.role === 'INTERN')
                      .map((u) => ({
                        value: u.id,
                        label: `${u.fullName} (${ROLE_LABELS[u.role]} · ${u.openTicketsCount} откр.)${u.id === user?.id ? ' — вы' : ''}`,
                      }))}
                    onChange={(assigneeId) => assignMutation.mutate(assigneeId)}
                    value={undefined}
                  />
                )}

                {canClassify && (
                  <Form
                    layout="inline"
                    onFinish={(values) => classifyMutation.mutate(values)}
                    initialValues={{ categoryId: ticket.category?.id, priority: ticket.priority ?? undefined }}
                  >
                    <Form.Item name="categoryId" rules={[{ required: true, message: 'Выберите категорию' }]}>
                      <Select
                        style={{ width: 220 }}
                        placeholder="Категория"
                        options={(categoriesQuery.data ?? []).map((c) => ({
                          value: c.id,
                          label: c.isActive ? c.name : `${c.name} (неактивна)`,
                          disabled: !c.isActive,
                        }))}
                      />
                    </Form.Item>
                    <Form.Item name="priority" rules={[{ required: true, message: 'Выберите приоритет' }]}>
                      <Select style={{ width: 160 }} placeholder="Приоритет" options={Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label }))} />
                    </Form.Item>
                    <Form.Item>
                      <Button htmlType="submit" loading={classifyMutation.isPending}>
                        {ticket.category ? 'Обновить классификацию' : 'Классифицировать'}
                      </Button>
                    </Form.Item>
                  </Form>
                )}

                {canActOnStatus && executorStatuses.length > 0 && (
                  <Space wrap>
                    {executorStatuses.map((s) => (
                      <Button key={s} onClick={() => statusMutation.mutate(s)} loading={statusMutation.isPending}>
                        {STATUS_LABELS[s]}
                      </Button>
                    ))}
                  </Space>
                )}
              </Space>
            </>
          )}

          {canReopen && (
            <>
              <Divider style={{ margin: '12px 0' }} />
              <Button danger onClick={() => statusMutation.mutate('REOPENED')} loading={statusMutation.isPending}>
                Переоткрыть заявку
              </Button>
            </>
          )}

          {isCreator && (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') && (
            <>
              <Divider style={{ margin: '12px 0' }} />
              {ticket.rating ? (
                <Space orientation="vertical" size={4}>
                  <Typography.Text>Ваша оценка решения:</Typography.Text>
                  <Rate disabled value={ticket.rating} />
                </Space>
              ) : (
                <Space orientation="vertical" size={8}>
                  <Typography.Text>Оцените, насколько хорошо решена проблема:</Typography.Text>
                  <Space>
                    <Rate value={ratingValue} onChange={setRatingValue} />
                    <Button
                      type="primary"
                      size="small"
                      disabled={!ratingValue}
                      loading={rateMutation.isPending}
                      onClick={() => rateMutation.mutate(ratingValue)}
                    >
                      Оценить
                    </Button>
                  </Space>
                </Space>
              )}
            </>
          )}
        </Card>

        <Card title="Обсуждение заявки" style={{ marginTop: 16 }}>
          {(commentsQuery.data ?? []).length === 0 ? (
            <Empty description="Пока нет сообщений" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(commentsQuery.data ?? []).map((c) => {
                if (c.isSystem) {
                  return (
                    <div key={c.id} style={{ textAlign: 'center' }}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {c.body} · {dayjs(c.createdAt).format('DD.MM HH:mm')}
                      </Typography.Text>
                    </div>
                  );
                }

                const authorRole = c.author?.role;
                const staff = authorRole ? isStaffRole(authorRole) : false;
                const isOwn = Boolean(user?.id && c.author?.id === user.id);
                const isEditing = editingCommentId === c.id;

                if (c.deletedAt) {
                  return (
                    <div key={c.id} style={{ display: 'flex', flexDirection: staff ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-start' }}>
                      <Avatar style={{ backgroundColor: '#bfbfbf', flexShrink: 0 }} icon={<UserOutlined />} />
                      <div style={{ maxWidth: '78%' }}>
                        <Typography.Text type="secondary" italic style={{ fontSize: 13 }}>
                          Комментарий удалён
                        </Typography.Text>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={c.id} style={{ display: 'flex', flexDirection: staff ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-start' }}>
                    <Avatar
                      style={{ backgroundColor: authorRole ? ROLE_COLORS[authorRole] : '#bfbfbf', flexShrink: 0 }}
                      icon={<UserOutlined />}
                    />
                    <div style={{ maxWidth: '78%' }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexDirection: staff ? 'row-reverse' : 'row' }}>
                        <Typography.Text strong style={{ fontSize: 13 }}>{c.author?.fullName ?? '—'}</Typography.Text>
                        {authorRole && (
                          <Tag color={staff ? 'blue' : 'default'} style={{ marginInlineEnd: 0 }}>
                            {ROLE_LABELS[authorRole]}
                          </Tag>
                        )}
                        {c.isInternal && <Tag color="warning" style={{ marginInlineEnd: 0 }}>Внутренняя заметка</Tag>}
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {dayjs(c.createdAt).format('DD.MM HH:mm')}
                          {c.editedAt && ' (изменено)'}
                        </Typography.Text>
                        {isOwn && !isEditing && (
                          <Space size={2}>
                            <Button
                              type="text"
                              size="small"
                              icon={<EditOutlined style={{ fontSize: 12 }} />}
                              onClick={() => { setEditingCommentId(c.id); setEditingBody(c.body); }}
                            />
                            <Popconfirm title="Удалить комментарий?" okText="Удалить" cancelText="Отмена" onConfirm={() => deleteCommentMutation.mutate(c.id)}>
                              <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 12 }} />} />
                            </Popconfirm>
                          </Space>
                        )}
                      </div>
                      {c.mentions.length > 0 && (
                        <div style={{ marginTop: 2 }}>
                          {c.mentions.map((m) => (
                            <Tag key={m.id} icon={<UserOutlined />} style={{ fontSize: 11 }}>
                              {m.fullName}
                            </Tag>
                          ))}
                        </div>
                      )}
                      {isEditing ? (
                        <div style={{ marginTop: 4 }}>
                          <Input.TextArea rows={3} value={editingBody} onChange={(e) => setEditingBody(e.target.value)} />
                          <Space style={{ marginTop: 6 }}>
                            <Button
                              size="small"
                              type="primary"
                              icon={<CheckOutlined />}
                              disabled={!editingBody.trim()}
                              loading={updateCommentMutation.isPending}
                              onClick={() => updateCommentMutation.mutate({ commentId: c.id, body: editingBody })}
                            >
                              Сохранить
                            </Button>
                            <Button size="small" icon={<CloseOutlined />} onClick={() => setEditingCommentId(null)}>
                              Отмена
                            </Button>
                          </Space>
                        </div>
                      ) : (
                        <div
                          style={{
                            marginTop: 4,
                            padding: '8px 12px',
                            borderRadius: 10,
                            background: c.isInternal ? token.colorWarningBg : staff ? token.colorPrimaryBg : token.colorFillTertiary,
                            border: c.isInternal ? `1px dashed ${token.colorWarningBorder}` : undefined,
                            borderTopRightRadius: staff ? 2 : 10,
                            borderTopLeftRadius: staff ? 10 : 2,
                          }}
                        >
                          <div style={{ whiteSpace: 'pre-wrap' }}>{c.body}</div>
                          {c.attachments.length > 0 && (
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                              {c.attachments.map((a) => (
                                <AttachmentPreview key={a.id} downloadUrl={`/tickets/${ticketId}/attachments/${a.id}`} attachment={a} />
                              ))}
                            </div>
                          )}
                          {c.knowledgeArticles.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                              {c.knowledgeArticles.map((a) => (
                                <KnowledgeArticleCard key={a.id} article={a} size="small" />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {typingUsers.length > 0 && (
            <Typography.Text type="secondary" italic style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
              {typingUsers.map((u) => u.fullName).join(', ')} {typingUsers.length === 1 ? 'печатает…' : 'печатают…'}
            </Typography.Text>
          )}

          {canComment && (
            <div style={{ marginTop: 20 }}>
              <Divider style={{ margin: '0 0 16px' }} />
              {canAttachArticles && mentionsEnabled && (
                <Mentions
                  rows={3}
                  prefix="@"
                  value={commentBody}
                  onChange={(text) => { setCommentBody(text); notifyTyping(); }}
                  placeholder="Написать сообщение... (@ — упомянуть коллегу)"
                  options={(staffDirectoryQuery.data ?? [])
                    .filter((u) => u.id !== user?.id)
                    .map((u) => ({ value: u.fullName, label: u.fullName, key: u.id, id: u.id }))}
                  onSelect={(option) => {
                    const staffId = (option as unknown as { id?: string }).id;
                    if (staffId) setCommentMentionIds((prev) => (prev.includes(staffId) ? prev : [...prev, staffId]));
                  }}
                />
              )}
              {(!canAttachArticles || !mentionsEnabled) && (
                <Input.TextArea
                  rows={3}
                  value={commentBody}
                  onChange={(e) => { setCommentBody(e.target.value); notifyTyping(); }}
                  placeholder="Написать сообщение..."
                />
              )}
              {canAttachArticles && (cannedResponsesQuery.data?.length ?? 0) > 0 && (
                <Select
                  showSearch
                  optionFilterProp="label"
                  style={{ width: '100%', marginTop: 8 }}
                  placeholder={<Space><FileTextOutlined /> Вставить шаблон ответа</Space>}
                  value={undefined}
                  onChange={(snippetId) => {
                    const snippet = cannedResponsesQuery.data?.find((s) => s.id === snippetId);
                    if (!snippet) return;
                    setCommentBody((prev) => (prev.trim() ? `${prev}\n${snippet.body}` : snippet.body));
                  }}
                  options={(cannedResponsesQuery.data ?? []).map((s) => ({ value: s.id, label: s.title }))}
                />
              )}
              {canAttachArticles && (
                <Select
                  mode="multiple"
                  showSearch
                  optionFilterProp="label"
                  style={{ width: '100%', marginTop: 8 }}
                  placeholder={<Space><ReadOutlined /> Прикрепить статью из базы знаний</Space>}
                  loading={knowledgeArticlesQuery.isLoading}
                  value={commentArticleIds}
                  onChange={setCommentArticleIds}
                  options={(knowledgeArticlesQuery.data ?? []).map((a) => ({ value: a.id, label: a.title }))}
                />
              )}
              {canAttachArticles && (
                <Checkbox checked={commentIsInternal} onChange={(e) => setCommentIsInternal(e.target.checked)} style={{ marginTop: 8 }}>
                  Внутренняя заметка (не видна заявителю)
                </Checkbox>
              )}
              <Space style={{ marginTop: 8 }}>
                <Upload multiple fileList={commentFiles} beforeUpload={() => false} onChange={({ fileList }) => setCommentFiles(fileList)} showUploadList={{ showRemoveIcon: true }}>
                  <Button icon={<UploadOutlined />}>Прикрепить</Button>
                </Upload>
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  disabled={!commentBody.trim()}
                  loading={commentMutation.isPending}
                  onClick={() => commentMutation.mutate()}
                >
                  Отправить
                </Button>
              </Space>
            </div>
          )}
        </Card>
      </Col>

      <Col span={8}>
        <Card title="История заявки">
          {(historyQuery.data ?? []).length === 0 ? (
            <Empty description="Пока пусто" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <Timeline
              items={(historyQuery.data ?? []).map((h) => ({
                color: HISTORY_DOT_COLORS[h.action] ?? 'blue',
                content: (
                  <>
                    <div style={{ fontWeight: 500 }}>{HISTORY_ACTION_LABELS[h.action] ?? h.action}</div>
                    {h.fromValue && h.toValue ? (
                      <div style={{ fontSize: 13 }}>
                        <Typography.Text type="secondary">{h.fromValue}</Typography.Text> → <Typography.Text>{h.toValue}</Typography.Text>
                      </div>
                    ) : h.toValue ? (
                      <div style={{ fontSize: 13 }}>{h.toValue}</div>
                    ) : null}
                    <Space size={6} style={{ marginTop: 2 }}>
                      {h.actor && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {h.actor.fullName}
                        </Typography.Text>
                      )}
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {dayjs(h.createdAt).format('DD.MM.YYYY HH:mm')}
                      </Typography.Text>
                    </Space>
                  </>
                ),
              }))}
            />
          )}
        </Card>
      </Col>
    </Row>
  );
}
