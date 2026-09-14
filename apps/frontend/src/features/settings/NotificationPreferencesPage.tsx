import { useMemo, useState } from 'react';
import { Button, Card, Divider, Switch, Typography, App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from '../../shared/api/notifications';
import { useAuth } from '../../shared/auth/AuthContext';
import { isStaffRole } from '../../shared/labels';
import { extractErrorMessage } from '../../shared/api/errors';
import type { UserRole } from '../../shared/types';

type Group = 'Заявки' | 'Визиты' | 'Картриджи и заправки' | 'Система';

interface TypeMeta {
  type: string;
  label: string;
  group: Group;
  roles: 'all' | 'staff' | 'admin' | 'user';
}

// Показываем только те типы, которые роль реально может получать (см. разведку по получателям).
const TYPES: TypeMeta[] = [
  { type: 'TICKET_CREATED', label: 'Создана новая заявка', group: 'Заявки', roles: 'admin' },
  { type: 'TICKET_ASSIGNED', label: 'Назначен исполнитель', group: 'Заявки', roles: 'all' },
  { type: 'TICKET_STATUS_CHANGED', label: 'Изменился статус заявки', group: 'Заявки', roles: 'all' },
  { type: 'TICKET_COMMENTED', label: 'Новый комментарий', group: 'Заявки', roles: 'all' },
  { type: 'TICKET_MENTIONED', label: 'Вас упомянули в комментарии', group: 'Заявки', roles: 'staff' },
  { type: 'TICKET_COLLABORATOR_ADDED', label: 'Вас добавили соисполнителем', group: 'Заявки', roles: 'staff' },
  { type: 'TICKET_RESPONSE_BREACHED', label: 'Просрочка реакции по SLA', group: 'Заявки', roles: 'staff' },
  { type: 'TICKET_RESOLUTION_BREACHED', label: 'Просрочка решения по SLA', group: 'Заявки', roles: 'staff' },
  { type: 'VISIT_PROPOSED', label: 'Предложено время визита', group: 'Визиты', roles: 'all' },
  { type: 'VISIT_CONFIRMED', label: 'Время визита подтверждено', group: 'Визиты', roles: 'all' },
  { type: 'VISIT_CANCELLED', label: 'Визит отменён', group: 'Визиты', roles: 'all' },
  { type: 'VISIT_RESCHEDULED', label: 'Визит перенесён', group: 'Визиты', roles: 'all' },
  { type: 'VISIT_REMINDER', label: 'Напоминание о скором визите', group: 'Визиты', roles: 'all' },
  { type: 'CARTRIDGE_FILLED', label: 'Картридж заправлен и возвращён', group: 'Картриджи и заправки', roles: 'user' },
  { type: 'REFILL_EVENT_CREATED', label: 'Создана плановая заправка', group: 'Картриджи и заправки', roles: 'user' },
  { type: 'REFILL_EVENT_REMINDER', label: 'Напоминание о сдаче картриджей', group: 'Картриджи и заправки', roles: 'user' },
  { type: 'ADMIN_BROADCAST', label: 'Рассылки администратора', group: 'Система', roles: 'all' },
  { type: 'SYSTEM_ERROR', label: 'Ошибка в системе', group: 'Система', roles: 'admin' },
];

function visibleFor(role: UserRole, meta: TypeMeta): boolean {
  switch (meta.roles) {
    case 'all':
      return true;
    case 'staff':
      return isStaffRole(role);
    case 'admin':
      return role === 'ADMIN';
    case 'user':
      return role === 'USER';
  }
}

export function NotificationPreferencesPage() {
  const { user } = useAuth();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['notification-preferences'], queryFn: fetchNotificationPreferences });
  const [draft, setDraft] = useState<NotificationPreferences | null>(null);

  const prefs = draft ?? data ?? {};
  const rows = useMemo(() => (user ? TYPES.filter((t) => visibleFor(user.role, t)) : []), [user]);

  const groups = useMemo(() => {
    const order: Group[] = ['Заявки', 'Визиты', 'Картриджи и заправки', 'Система'];
    return order
      .map((g) => ({ group: g, items: rows.filter((r) => r.group === g) }))
      .filter((g) => g.items.length > 0);
  }, [rows]);

  const set = (type: string, patch: Partial<{ enabled: boolean; push: boolean }>) => {
    const base = draft ?? data ?? {};
    const cur = base[type] ?? { enabled: true, push: true };
    setDraft({ ...base, [type]: { ...cur, ...patch } });
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      updateNotificationPreferences(
        rows.map((r) => ({
          type: r.type,
          enabled: prefs[r.type]?.enabled ?? true,
          push: prefs[r.type]?.push ?? true,
        })),
      ),
    onSuccess: () => {
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
      message.success('Настройки сохранены');
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Не удалось сохранить настройки')),
  });

  return (
    <Card title="Настройки уведомлений" loading={isLoading} style={{ maxWidth: 720 }}>
      <Typography.Paragraph type="secondary">
        «Уведомлять» — показывать в колокольчике. «Push» — присылать push-уведомление браузера
        (нужно включить push-подписку в колокольчике). Любой тип можно выключить полностью.
      </Typography.Paragraph>

      {groups.map(({ group, items }) => (
        <div key={group}>
          <Divider titlePlacement="start" style={{ margin: '12px 0' }}>{group}</Divider>
          {items.map((r) => {
            const p = prefs[r.type] ?? { enabled: true, push: true };
            return (
              <div
                key={r.type}
                style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '6px 0' }}
              >
                <span style={{ flex: 1 }}>{r.label}</span>
                <Switch
                  size="small"
                  checked={p.enabled}
                  onChange={(v) => set(r.type, { enabled: v })}
                  checkedChildren="вкл"
                  unCheckedChildren="выкл"
                />
                <Switch
                  size="small"
                  disabled={!p.enabled}
                  checked={p.enabled && p.push}
                  onChange={(v) => set(r.type, { push: v })}
                  checkedChildren="push"
                  unCheckedChildren="push"
                />
              </div>
            );
          })}
        </div>
      ))}

      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12 }}>
        Рассылки администратора тоже можно отключить — не рекомендуется, они бывают важными.
      </Typography.Paragraph>

      <Button type="primary" loading={saveMutation.isPending} disabled={!draft} onClick={() => saveMutation.mutate()}>
        Сохранить
      </Button>
    </Card>
  );
}
