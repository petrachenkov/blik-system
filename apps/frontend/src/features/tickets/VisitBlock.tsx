import { useMemo, useState } from 'react';
import { Alert, Button, Card, DatePicker, Input, Popconfirm, Space, Tag, Typography, App as AntdApp } from 'antd';
import { CalendarOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import {
  confirmVisit,
  counterVisit,
  fetchTicketVisits,
  fetchVisitConflicts,
  proposeVisit,
  updateVisitStatus,
  type TicketVisit,
  type VisitSlot,
} from '../../shared/api/visits';
import { fetchWorkingHours } from '../../shared/api/system';
import { changeTicketStatus } from '../../shared/api/tickets';
import { buildWorkingHoursDisabled } from '../../shared/workingHours';
import { useFeatureFlag } from '../../shared/flags/FeatureFlagsContext';
import { useAuth } from '../../shared/auth/AuthContext';
import { extractErrorMessage } from '../../shared/api/errors';
import type { TicketStatus } from '../../shared/types';

const STATUS_TAG: Record<TicketVisit['status'], { color: string; label: string }> = {
  PROPOSED: { color: 'gold', label: 'ждёт выбора времени' },
  CONFIRMED: { color: 'green', label: 'подтверждён' },
  DONE: { color: 'default', label: 'состоялся' },
  CANCELLED: { color: 'default', label: 'отменён' },
};

function fmtSlot(s: VisitSlot) {
  return `${dayjs(s.start).format('DD.MM HH:mm')} — ${dayjs(s.end).format('HH:mm')}`;
}

interface SlotDraft {
  start: Dayjs | null;
  end: Dayjs | null;
}

interface Props {
  ticketId: string;
  isCreator: boolean;
  isStaff: boolean;
  ticketStatus?: TicketStatus;
  assigneeId?: string | null;
}

export function VisitBlock({ ticketId, isCreator, isStaff, ticketStatus, assigneeId }: Props) {
  const enabled = useFeatureFlag('visits');
  const { user } = useAuth();
  const { message, modal } = AntdApp.useApp();
  const queryClient = useQueryClient();

  // Одна форма окон для двух сценариев: сотрудник предлагает новый визит / заявитель предлагает встречное.
  const [formMode, setFormMode] = useState<null | 'propose' | 'counter'>(null);
  const [slots, setSlots] = useState<SlotDraft[]>([{ start: null, end: null }]);
  const [note, setNote] = useState('');

  const { data: visits = [] } = useQuery({
    queryKey: ['tickets', ticketId, 'visits'],
    queryFn: () => fetchTicketVisits(ticketId),
    enabled,
  });
  const { data: workingHours } = useQuery({ queryKey: ['working-hours'], queryFn: fetchWorkingHours, enabled });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['tickets', ticketId, 'visits'] });
    void queryClient.invalidateQueries({ queryKey: ['tickets', ticketId, 'history'] });
    void queryClient.invalidateQueries({ queryKey: ['tickets', ticketId] });
    void queryClient.invalidateQueries({ queryKey: ['my-day'] });
  };

  const resetForm = () => {
    setFormMode(null);
    setSlots([{ start: null, end: null }]);
    setNote('');
  };

  const draftPayload = () => ({
    slots: slots
      .filter((s): s is { start: Dayjs; end: Dayjs } => Boolean(s.start && s.end))
      .map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })),
    note: note.trim() || undefined,
  });

  const proposeMutation = useMutation({
    mutationFn: () => proposeVisit(ticketId, draftPayload()),
    onSuccess: () => { resetForm(); invalidate(); message.success('Варианты времени отправлены заявителю'); },
    onError: (e) => message.error(extractErrorMessage(e, 'Не удалось предложить время')),
  });

  const counterMutation = useMutation({
    mutationFn: (visitId: string) => counterVisit(visitId, draftPayload()),
    onSuccess: () => { resetForm(); invalidate(); message.success('Ваши варианты времени отправлены системному администратору'); },
    onError: (e) => message.error(extractErrorMessage(e, 'Не удалось отправить время')),
  });

  const confirmMutation = useMutation({
    mutationFn: ({ visitId, slotId }: { visitId: string; slotId: string }) => confirmVisit(visitId, slotId),
    onSuccess: () => { invalidate(); message.success('Время визита подтверждено'); },
    onError: (e) => message.error(extractErrorMessage(e, 'Не удалось подтвердить')),
  });

  const resolveMutation = useMutation({
    mutationFn: () => changeTicketStatus(ticketId, 'RESOLVED'),
    onSuccess: () => { invalidate(); message.success('Заявка переведена в «Решено»'); },
    onError: (e) => message.error(extractErrorMessage(e, 'Не удалось перевести заявку')),
  });

  const statusMutation = useMutation({
    mutationFn: ({ visitId, status }: { visitId: string; status: 'DONE' | 'CANCELLED' }) => updateVisitStatus(visitId, status),
    onSuccess: (_data, vars) => {
      invalidate();
      message.success('Готово');
      if (vars.status === 'DONE' && isStaff && ticketStatus === 'IN_PROGRESS') {
        modal.confirm({
          title: 'Визит состоялся',
          content: 'Перевести заявку в статус «Решено»?',
          okText: 'Перевести',
          cancelText: 'Позже',
          onOk: () => resolveMutation.mutateAsync(),
        });
      }
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Не удалось изменить визит')),
  });

  const disabled = useMemo(() => buildWorkingHoursDisabled(workingHours), [workingHours]);

  const firstSlot = slots[0];
  const { data: conflicts = [] } = useQuery({
    queryKey: ['visit-conflicts', assigneeId ?? user?.id, firstSlot?.start?.toISOString(), firstSlot?.end?.toISOString()],
    queryFn: () =>
      fetchVisitConflicts({
        technicianId: assigneeId ?? user!.id,
        start: firstSlot!.start!.toISOString(),
        end: firstSlot!.end!.toISOString(),
      }),
    enabled: Boolean(enabled && isStaff && formMode === 'propose' && firstSlot?.start && firstSlot?.end && (assigneeId ?? user?.id)),
  });

  if (!enabled) return null;

  const active = visits.find((v) => v.status === 'PROPOSED' || v.status === 'CONFIRMED');
  const past = visits.filter((v) => v.status === 'DONE' || v.status === 'CANCELLED');
  const canProposeNew = isStaff && !active;

  const validDraft =
    slots.some((s) => s.start && s.end) && slots.every((s) => !s.start || !s.end || s.end.isAfter(s.start));

  // Кто выбирает окно в PROPOSED: обычно заявитель; после встречного предложения — сотрудник.
  const requesterPicks = active?.status === 'PROPOSED' && !active.counterProposed && isCreator;
  const staffPicks = active?.status === 'PROPOSED' && active.counterProposed && isStaff;

  const slotForm = (onSubmit: () => void, submitLabel: string, pending: boolean) => (
    <div>
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>Предложите до 3 окон:</Typography.Text>
      <Space direction="vertical" style={{ display: 'flex', marginTop: 8 }} size={8}>
        {slots.map((slot, i) => (
          <Space key={i} wrap>
            <DatePicker
              showTime={{ format: 'HH:mm', minuteStep: 15 }}
              format="DD.MM HH:mm"
              placeholder="начало"
              value={slot.start}
              {...disabled}
              onChange={(v) => setSlots((prev) => prev.map((s, j) => (j === i ? { ...s, start: v } : s)))}
            />
            <DatePicker
              showTime={{ format: 'HH:mm', minuteStep: 15 }}
              format="DD.MM HH:mm"
              placeholder="конец"
              value={slot.end}
              {...disabled}
              onChange={(v) => setSlots((prev) => prev.map((s, j) => (j === i ? { ...s, end: v } : s)))}
            />
            {slots.length > 1 && (
              <Button size="small" type="text" danger onClick={() => setSlots((prev) => prev.filter((_, j) => j !== i))}>
                убрать
              </Button>
            )}
          </Space>
        ))}
        {slots.length < 3 && (
          <Button size="small" icon={<PlusOutlined />} onClick={() => setSlots((prev) => [...prev, { start: null, end: null }])}>
            ещё окно
          </Button>
        )}
        {conflicts.length > 0 && formMode === 'propose' && (
          <Alert
            type="warning"
            showIcon
            style={{ fontSize: 12 }}
            message={`Первое окно пересекается: ${conflicts.map((c) => c.label).join(', ')}`}
          />
        )}
        <Input.TextArea
          rows={2}
          placeholder={formMode === 'counter' ? 'Комментарий для системного администратора (необязательно)' : 'Примечание для заявителя (необязательно)'}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Space>
          <Button type="primary" size="small" disabled={!validDraft} loading={pending} onClick={onSubmit}>
            {submitLabel}
          </Button>
          <Button size="small" onClick={resetForm}>Отмена</Button>
        </Space>
      </Space>
    </div>
  );

  return (
    <Card size="small" title={<Space><CalendarOutlined /> Визит системного администратора</Space>} style={{ marginBottom: 16 }}>
      {active && (
        <div style={{ marginBottom: past.length || canProposeNew ? 12 : 0 }}>
          <Space wrap>
            <Tag color={STATUS_TAG[active.status].color}>{STATUS_TAG[active.status].label}</Tag>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>исполнитель: {active.technician.fullName}</Typography.Text>
            {active.counterProposed && <Tag color="blue">встречное предложение заявителя</Tag>}
          </Space>
          {active.note && (
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0 0' }}>{active.note}</Typography.Paragraph>
          )}

          {active.status === 'CONFIRMED' && active.scheduledStart && (
            <div style={{ marginTop: 8 }}>
              <Typography.Text strong>
                {dayjs(active.scheduledStart).format('DD.MM.YYYY, HH:mm')}
                {active.scheduledEnd ? `–${dayjs(active.scheduledEnd).format('HH:mm')}` : ''}
              </Typography.Text>
              <div style={{ marginTop: 8 }}>
                <Space wrap>
                  {isStaff && (
                    <Button size="small" onClick={() => statusMutation.mutate({ visitId: active.id, status: 'DONE' })}>
                      Визит состоялся
                    </Button>
                  )}
                  {(isStaff || isCreator) && (
                    <Popconfirm
                      title={isCreator && !isStaff ? 'Не сможете присутствовать?' : 'Отменить визит?'}
                      description={isCreator && !isStaff ? 'Системный администратор предложит другое время.' : undefined}
                      onConfirm={() => statusMutation.mutate({ visitId: active.id, status: 'CANCELLED' })}
                      okText={isCreator && !isStaff ? 'Да, отменить' : 'Отменить'}
                      cancelText="Нет"
                    >
                      <Button size="small" danger>{isCreator && !isStaff ? 'Не смогу присутствовать' : 'Отменить'}</Button>
                    </Popconfirm>
                  )}
                </Space>
              </div>
            </div>
          )}

          {active.status === 'PROPOSED' && (
            <div style={{ marginTop: 8 }}>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                {active.counterProposed ? 'Заявитель предложил:' : 'Предложенные окна:'}
              </Typography.Text>
              <Space direction="vertical" style={{ display: 'flex', marginTop: 6 }} size={6}>
                {active.slots.map((s) => (
                  <Space key={s.id} wrap>
                    <Tag>{fmtSlot(s)}</Tag>
                    {(requesterPicks || staffPicks) && (
                      <Button
                        size="small"
                        type="primary"
                        loading={confirmMutation.isPending}
                        onClick={() => confirmMutation.mutate({ visitId: active.id, slotId: s.id })}
                      >
                        Выбрать это время
                      </Button>
                    )}
                  </Space>
                ))}
              </Space>

              {requesterPicks && formMode !== 'counter' && (
                <Space wrap style={{ marginTop: 8 }}>
                  <Button size="small" onClick={() => setFormMode('counter')}>Предложить своё время</Button>
                  <Popconfirm
                    title="Ни одно окно не подходит?"
                    description="Визит будет отменён, системный администратор предложит другие варианты."
                    onConfirm={() => statusMutation.mutate({ visitId: active.id, status: 'CANCELLED' })}
                    okText="Да, отклонить"
                    cancelText="Отмена"
                  >
                    <Button size="small">Ни одно не подходит</Button>
                  </Popconfirm>
                </Space>
              )}

              {formMode === 'counter' && active && (
                <div style={{ marginTop: 8 }}>{slotForm(() => counterMutation.mutate(active.id), 'Отправить системному администратору', counterMutation.isPending)}</div>
              )}

              {isStaff && !active.counterProposed && (
                <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                  Ожидаем, пока заявитель выберет удобное окно.
                </Typography.Paragraph>
              )}
              {isCreator && active.counterProposed && (
                <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                  Ожидаем, пока системный администратор подтвердит одно из предложенных вами окон.
                </Typography.Paragraph>
              )}
            </div>
          )}
        </div>
      )}

      {canProposeNew && formMode !== 'propose' && (
        <Button size="small" icon={<CalendarOutlined />} onClick={() => setFormMode('propose')}>
          Предложить время визита
        </Button>
      )}

      {canProposeNew && formMode === 'propose' && slotForm(() => proposeMutation.mutate(), 'Отправить заявителю', proposeMutation.isPending)}

      {past.length > 0 && (
        <div style={{ marginTop: active || canProposeNew ? 12 : 0 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Прошлые визиты: {past.map((v) => `${STATUS_TAG[v.status].label}${v.scheduledStart ? ` (${dayjs(v.scheduledStart).format('DD.MM')})` : ''}`).join(', ')}
          </Typography.Text>
        </div>
      )}

      {!active && !canProposeNew && past.length === 0 && (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>Визит не запланирован.</Typography.Text>
      )}
    </Card>
  );
}
