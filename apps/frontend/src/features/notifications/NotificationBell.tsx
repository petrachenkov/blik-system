import { BellOutlined, MobileOutlined } from '@ant-design/icons';
import { App as AntdApp, Avatar, Badge, Button, Empty, List, Popover, Space, Switch, Tooltip, Typography, theme } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { fetchNotifications, markAllNotificationsRead } from '../../shared/api/notifications';
import { getNotificationDisplay } from '../../shared/notificationDisplay';
import { usePushSubscription } from '../../shared/push/usePushSubscription';
import { useFeatureFlag } from '../../shared/flags/FeatureFlagsContext';
import { extractErrorMessage } from '../../shared/api/errors';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { token } = theme.useToken();
  const { message } = AntdApp.useApp();
  const push = usePushSubscription();
  const webPushEnabled = useFeatureFlag('web_push');

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetchNotifications(),
    refetchInterval: 60_000,
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  // Открыли колокольчик — считаем всё прочитанным, как в большинстве почтовых/чат-клиентов.
  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && unreadCount > 0) {
      markAllReadMutation.mutate();
    }
  };

  const handleClick = (ticketId: string | null) => {
    setOpen(false);
    if (ticketId) navigate(`/tickets/${ticketId}`);
  };

  const handlePushToggle = async (checked: boolean) => {
    try {
      if (checked) await push.subscribe();
      else await push.unsubscribe();
    } catch (error) {
      // extractErrorMessage понимает только ответы axios — subscribe()/unsubscribe() чаще
      // бросают обычный Error (нет VAPID-ключа, отказано в разрешении на уведомления и т.п.),
      // и без этой ветки пользователь видел только маску "не удалось", а не причину.
      const text = error instanceof Error && !isAxiosError(error) ? error.message : undefined;
      message.error(text ?? extractErrorMessage(error, 'Не удалось изменить push-уведомления'));
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={handleOpenChange}
      trigger="click"
      placement="bottomRight"
      title={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          Уведомления
          {webPushEnabled && push.state !== 'unsupported' && push.state !== 'checking' && (
            <Tooltip title="Push-уведомления браузера">
              <Space size={4}>
                <MobileOutlined style={{ color: token.colorTextSecondary }} />
                <Switch size="small" checked={push.state === 'subscribed'} loading={push.busy} onChange={handlePushToggle} />
              </Space>
            </Tooltip>
          )}
        </Space>
      }
      content={
        // Фиксированные 360px при placement="bottomRight" возле колокольчика у правого края
        // шапки не помещались на узких экранах и обрезались слева (см. фидбэк со скриншотом) —
        // 92vw почти не сокращал ширину (92% от 390px ≈ 359px, тот же результат), поэтому
        // жёсткий потолок 320px + отступ по 12px с каждой стороны на совсем узких экранах.
        <div style={{ width: 'min(320px, calc(100vw - 24px))', maxHeight: 420, overflowY: 'auto' }}>
          {notifications.length === 0 ? (
            <Empty description="Пока нет уведомлений" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <List
              dataSource={notifications}
              renderItem={(n) => {
                const { icon, color } = getNotificationDisplay(n.type);
                return (
                  <List.Item
                    onClick={() => handleClick(n.ticketId)}
                    style={{
                      cursor: n.ticketId ? 'pointer' : 'default',
                      background: n.isRead ? undefined : token.colorPrimaryBg,
                      padding: '8px 12px',
                      borderRadius: token.borderRadius,
                    }}
                  >
                    <List.Item.Meta
                      avatar={<Avatar icon={icon} style={{ backgroundColor: color }} size="small" />}
                      title={n.title}
                      description={
                        <>
                          <div>{n.body}</div>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {dayjs(n.createdAt).format('DD.MM HH:mm')}
                          </Typography.Text>
                        </>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          )}
        </div>
      }
    >
      <Button type="text" icon={<Badge count={unreadCount} size="small"><BellOutlined style={{ fontSize: 18 }} /></Badge>} />
    </Popover>
  );
}
