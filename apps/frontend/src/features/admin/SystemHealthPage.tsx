import { Card, Col, Progress, Row, Space, Tag, Typography } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  MinusCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { ReactNode } from 'react';
import { fetchHealth } from '../../shared/api/system';

type Status = 'ok' | 'warn' | 'down' | 'disabled';

const STATUS_META: Record<Status, { color: string; icon: ReactNode; label: string }> = {
  ok: { color: 'green', icon: <CheckCircleOutlined />, label: 'Работает' },
  warn: { color: 'gold', icon: <WarningOutlined />, label: 'Внимание' },
  down: { color: 'red', icon: <CloseCircleOutlined />, label: 'Недоступно' },
  disabled: { color: 'default', icon: <MinusCircleOutlined />, label: 'Не активно' },
};

function StatusTag({ status }: { status: Status }) {
  const m = STATUS_META[status];
  return (
    <Tag color={m.color} icon={m.icon}>
      {m.label}
    </Tag>
  );
}

function bytes(n: number): string {
  if (n <= 0) return '0';
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(1)} ${units[i]}`;
}

function HealthCard({ title, status, children }: { title: string; status: Status; children?: ReactNode }) {
  return (
    <Card size="small" title={title} extra={<StatusTag status={status} />} style={{ height: '100%' }}>
      {children}
    </Card>
  );
}

export function SystemHealthPage() {
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['system', 'health'],
    queryFn: fetchHealth,
    refetchInterval: 20_000,
  });

  const c = data?.components;

  return (
    <Card
      title="Здоровье системы"
      loading={isLoading && !data}
      extra={
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Обновлено {dayjs(dataUpdatedAt).format('HH:mm:ss')}
        </Typography.Text>
      }
    >
      {c && (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={8}>
            <HealthCard title="База данных (PostgreSQL)" status={c.db.status}>
              <Typography.Text type="secondary">Отклик: {c.db.latencyMs} мс</Typography.Text>
              {c.db.error && <div><Typography.Text type="danger" style={{ fontSize: 12 }}>{c.db.error}</Typography.Text></div>}
            </HealthCard>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <HealthCard title="Каталог (LDAP / AD)" status={c.ldap.status}>
              <Typography.Text type="secondary">Отклик: {c.ldap.latencyMs} мс</Typography.Text>
              {c.ldap.error && <div><Typography.Text type="danger" style={{ fontSize: 12 }}>{c.ldap.error}</Typography.Text></div>}
            </HealthCard>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <HealthCard title="Push-уведомления" status={c.webPush.status}>
              <Space direction="vertical" size={2}>
                <Typography.Text type="secondary">VAPID-ключи: {c.webPush.configured ? 'заданы' : 'не заданы'}</Typography.Text>
                <Typography.Text type="secondary">Активных подписок: {c.webPush.subscriptions}</Typography.Text>
              </Space>
            </HealthCard>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <HealthCard title="Диск для вложений" status={c.disk.status}>
              {c.disk.error ? (
                <Typography.Text type="danger" style={{ fontSize: 12 }}>{c.disk.error}</Typography.Text>
              ) : (
                <>
                  <Progress
                    percent={c.disk.usedPercent}
                    size="small"
                    status={c.disk.status === 'down' ? 'exception' : c.disk.status === 'warn' ? 'active' : 'normal'}
                  />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Свободно {bytes(c.disk.freeBytes)} из {bytes(c.disk.totalBytes)}
                  </Typography.Text>
                </>
              )}
            </HealthCard>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <HealthCard title="Мессенджер MAX" status={c.max.status}>
              <Typography.Text type="secondary">Канал не активирован</Typography.Text>
            </HealthCard>
          </Col>
        </Row>
      )}
    </Card>
  );
}
