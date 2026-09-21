import { Button, Card, Form, Input, Popconfirm, Select, Space, Table, Tag, Tooltip, Typography, App as AntdApp } from 'antd';
import { CloudSyncOutlined, DeleteOutlined, UserAddOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLocalUser, deleteUser, fetchUsers, setUserRole, syncUsersFromLdap } from '../../shared/api/catalogs';
import { ROLE_LABELS } from '../../shared/labels';
import { extractErrorMessage } from '../../shared/api/errors';
import { useAuth } from '../../shared/auth/AuthContext';
import type { UserRole } from '../../shared/types';
import dayjs from 'dayjs';

const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as UserRole[]).map((value) => ({ value, label: ROLE_LABELS[value] }));

interface CreateFormValues {
  username: string;
  fullName: string;
  password: string;
  role: UserRole;
}

export function UsersPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const { data = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: () => fetchUsers() });
  const [form] = Form.useForm<CreateFormValues>();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) => setUserRole(id, role),
    onSuccess: () => { void invalidate(); message.success('Роль обновлена'); },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось изменить роль')),
  });

  const syncMutation = useMutation({
    mutationFn: syncUsersFromLdap,
    onSuccess: (result) => {
      void invalidate();
      message.success(`Синхронизировано из AD: ${result.synced}, деактивировано: ${result.deactivated}`);
    },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось синхронизировать с AD')),
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateFormValues) => createLocalUser(values),
    onSuccess: () => { form.resetFields(); void invalidate(); message.success('Локальная учётная запись создана'); },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось создать учётную запись')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => { void invalidate(); message.success('Учётная запись удалена'); },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось удалить учётную запись')),
  });

  return (
    <Space direction="vertical" size="large" style={{ display: 'flex' }}>
      <Card title={<Space><UserAddOutlined /> Создать локальную учётную запись</Space>}>
        <Typography.Paragraph type="secondary">
          Локальная учётка не связана с Active Directory — вход по заданному здесь логину и паролю. Пригодится для подрядчиков и служебных доступов.
        </Typography.Paragraph>
        <Form form={form} layout="inline" onFinish={(values) => createMutation.mutate(values)} style={{ rowGap: 8 }}>
          <Form.Item name="username" rules={[{ required: true, min: 3, message: 'Логин (латиница/цифры)' }]}>
            <Input placeholder="Логин" style={{ width: 160 }} autoComplete="off" />
          </Form.Item>
          <Form.Item name="fullName" rules={[{ required: true, min: 2, message: 'ФИО' }]}>
            <Input placeholder="ФИО" style={{ width: 220 }} />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, min: 8, message: 'Пароль от 8 символов' }]}>
            <Input.Password placeholder="Пароль" style={{ width: 180 }} autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="role" initialValue={'USER' as UserRole} rules={[{ required: true }]}>
            <Select style={{ width: 160 }} options={ROLE_OPTIONS} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={createMutation.isPending}>Создать</Button>
          </Form.Item>
        </Form>
      </Card>

      <Card
        styles={{ header: { paddingBlock: 16 } }}
        title="Пользователи"
        extra={
          <Tooltip title="Добавляет в список сотрудников из группы AD, которые ещё ни разу не входили в систему сами">
            <Button icon={<CloudSyncOutlined />} loading={syncMutation.isPending} onClick={() => syncMutation.mutate()}>
              Подтянуть сотрудников из AD
            </Button>
          </Tooltip>
        }
      >
        <Table
          rowKey="id"
          loading={isLoading}
          dataSource={data}
          scroll={{ x: 'max-content' }}
          columns={[
            {
              title: 'Пользователь',
              render: (_, record) => (
                <Space>
                  {record.fullName}
                  {record.isMaster && <Tag color="purple">Master</Tag>}
                </Space>
              ),
            },
            { title: 'Логин', dataIndex: 'username' },
            { title: 'Источник', dataIndex: 'source', render: (s) => (s === 'LOCAL' ? <Tag>Локальная</Tag> : <Tag color="blue">LDAP</Tag>) },
            {
              title: 'Роль',
              render: (_, record) =>
                record.isMaster ? (
                  <Tooltip title="Роль master-аккаунта зафиксирована — breakglass-статус защищает его от блокировки">
                    <Select style={{ width: 200 }} value={record.role} options={ROLE_OPTIONS} disabled />
                  </Tooltip>
                ) : (
                  <Select
                    style={{ width: 200 }}
                    value={record.role}
                    options={ROLE_OPTIONS}
                    onChange={(role) => roleMutation.mutate({ id: record.id, role })}
                  />
                ),
            },
            { title: 'Может подавать заявки', dataIndex: 'isStaff', render: (v) => (v ? 'Да' : 'Нет') },
            {
              title: 'Открыто сейчас',
              dataIndex: 'openTicketsCount',
              render: (v: number) => <Tag color={v > 7 ? 'red' : v > 3 ? 'gold' : 'green'}>{v}</Tag>,
            },
            { title: 'Последний вход', dataIndex: 'lastLoginAt', render: (v) => (v ? dayjs(v).format('DD.MM.YYYY HH:mm') : '—') },
            {
              title: '',
              width: 60,
              render: (_, record) =>
                record.isMaster || record.id === currentUser?.id ? null : (
                  <Popconfirm
                    title="Удалить учётную запись?"
                    description="Её заявки и комментарии останутся, но их автором станет «Удалённый пользователь». Отменить нельзя."
                    okText="Удалить"
                    cancelText="Отмена"
                    onConfirm={() => deleteMutation.mutate(record.id)}
                  >
                    <Button danger type="text" icon={<DeleteOutlined />} loading={deleteMutation.isPending} />
                  </Popconfirm>
                ),
            },
          ]}
        />
      </Card>
    </Space>
  );
}
