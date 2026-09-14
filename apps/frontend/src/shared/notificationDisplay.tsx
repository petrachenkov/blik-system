import {
  BellOutlined,
  BugOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  FileAddOutlined,
  MessageOutlined,
  NotificationOutlined,
  PrinterOutlined,
  SyncOutlined,
  TagsOutlined,
  TeamOutlined,
  UserOutlined,
  UserSwitchOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';

interface NotificationDisplay {
  icon: ReactNode;
  color: string;
}

/**
 * Значок + цвет по типу уведомления (см. фидбэк — разные уведомления должны отличаться
 * друг от друга с первого взгляда, а не быть одинаковыми строчками текста). Тип уведомления
 * с бэкенда приходит нетипизированной строкой (см. AppNotification.type) — незнакомое
 * значение просто получает нейтральный BellOutlined, ничего не ломается.
 */
const NOTIFICATION_DISPLAY: Record<string, NotificationDisplay> = {
  TICKET_CREATED: { icon: <FileAddOutlined />, color: '#1677ff' },
  TICKET_ASSIGNED: { icon: <UserSwitchOutlined />, color: '#2f54eb' },
  TICKET_CLASSIFIED: { icon: <TagsOutlined />, color: '#13a8a8' },
  TICKET_STATUS_CHANGED: { icon: <SyncOutlined />, color: '#faad14' },
  TICKET_COMMENTED: { icon: <MessageOutlined />, color: '#13a8a8' },
  TICKET_MENTIONED: { icon: <UserOutlined />, color: '#9254de' },
  TICKET_RESPONSE_BREACHED: { icon: <WarningOutlined />, color: '#ff4d4f' },
  TICKET_RESOLUTION_BREACHED: { icon: <WarningOutlined />, color: '#cf1322' },
  CARTRIDGE_FILLED: { icon: <PrinterOutlined />, color: '#52c41a' },
  REFILL_EVENT_CREATED: { icon: <CalendarOutlined />, color: '#722ed1' },
  REFILL_EVENT_REMINDER: { icon: <ClockCircleOutlined />, color: '#fa8c16' },
  ADMIN_BROADCAST: { icon: <NotificationOutlined />, color: '#eb2f96' },
  SYSTEM_ERROR: { icon: <BugOutlined />, color: '#cf1322' },
  VISIT_PROPOSED: { icon: <CalendarOutlined />, color: '#13a8a8' },
  VISIT_CONFIRMED: { icon: <CalendarOutlined />, color: '#52c41a' },
  VISIT_CANCELLED: { icon: <CalendarOutlined />, color: '#ff4d4f' },
  VISIT_REMINDER: { icon: <ClockCircleOutlined />, color: '#fa8c16' },
  VISIT_RESCHEDULED: { icon: <CalendarOutlined />, color: '#fa8c16' },
  TICKET_COLLABORATOR_ADDED: { icon: <TeamOutlined />, color: '#2f54eb' },
};

const DEFAULT_DISPLAY: NotificationDisplay = { icon: <BellOutlined />, color: '#8c8c8c' };

export function getNotificationDisplay(type: string): NotificationDisplay {
  return NOTIFICATION_DISPLAY[type] ?? DEFAULT_DISPLAY;
}
