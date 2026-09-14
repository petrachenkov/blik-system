import { Card, Table, Tag, Tooltip, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { fetchLoginEvents, type LoginEvent, type LoginEventResult } from '../../shared/api/loginLog';

const RESULT_LABELS: Record<LoginEventResult, string> = {
  SUCCESS: 'Успешный вход',
  INVALID_CREDENTIALS: 'Неверный логин/пароль',
  ACCOUNT_DISABLED: 'Учётная запись отключена',
  LDAP_UNAVAILABLE: 'Сервер каталога недоступен',
  MAINTENANCE: 'Режим обслуживания',
};

const RESULT_COLORS: Record<LoginEventResult, string> = {
  SUCCESS: 'green',
  INVALID_CREDENTIALS: 'red',
  ACCOUNT_DISABLED: 'orange',
  LDAP_UNAVAILABLE: 'default',
  MAINTENANCE: 'gold',
};

/** Журнал входов — успешные и неудачные попытки, с IP/User-Agent (см. план). */
export function LoginLogPage() {
  const { data = [], isLoading } = useQuery({ queryKey: ['login-events'], queryFn: fetchLoginEvents });

  return (
    <Card title="Журнал входов">
      <Table<LoginEvent>
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        pagination={{ pageSize: 50 }}
        columns={[
          { title: 'Время', dataIndex: 'createdAt', render: (v: string) => dayjs(v).format('DD.MM.YYYY HH:mm:ss') },
          { title: 'Логин', dataIndex: 'username' },
          { title: 'Пользователь', render: (_, r) => r.user?.fullName ?? <Typography.Text type="secondary">не найден</Typography.Text> },
          { title: 'Результат', dataIndex: 'result', render: (v: LoginEventResult) => <Tag color={RESULT_COLORS[v]}>{RESULT_LABELS[v]}</Tag> },
          { title: 'IP', dataIndex: 'ipAddress', render: (v: string | null) => v ?? '—' },
          {
            title: 'User-Agent',
            dataIndex: 'userAgent',
            ellipsis: true,
            render: (v: string | null) => (v ? <Tooltip title={v}>{v}</Tooltip> : '—'),
          },
        ]}
      />
    </Card>
  );
}
