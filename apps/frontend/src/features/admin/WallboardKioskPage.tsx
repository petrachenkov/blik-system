import { Alert, Button, Card, Form, Input, Popconfirm, Space, Table, Tag, Typography, App as AntdApp } from 'antd';
import { CopyOutlined, DesktopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useState } from 'react';
import { createKioskToken, fetchKioskTokens, revokeKioskToken, type KioskToken } from '../../shared/api/wallboard';
import { extractErrorMessage } from '../../shared/api/errors';

export function WallboardKioskPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{ label: string }>();
  const [freshUrl, setFreshUrl] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({ queryKey: ['kiosk-tokens'], queryFn: fetchKioskTokens });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['kiosk-tokens'] });

  const createMutation = useMutation({
    mutationFn: (label: string) => createKioskToken(label),
    onSuccess: (data) => {
      form.resetFields();
      setFreshUrl(data.url);
      void invalidate();
    },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось создать ссылку')),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeKioskToken(id),
    onSuccess: () => { void invalidate(); message.success('Ссылка отозвана'); },
  });

  return (
    <Space direction="vertical" size="large" style={{ display: 'flex', maxWidth: 900 }}>
      <Card
        styles={{ header: { paddingBlock: 16 } }}
        title="Настенная панель"
        extra={
          <Button icon={<DesktopOutlined />} onClick={() => window.open('/wallboard', '_blank', 'noopener')}>
            Открыть панель
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">
          Панель показывает очередь заявок, просрочки и загрузку исполнителей в реальном времени — для телевизора в дежурной комнате.
          Открыть её можно под своей учётной записью (кнопка выше) или по kiosk-ссылке без пароля (ниже).
        </Typography.Paragraph>

        <Form form={form} layout="inline" onFinish={({ label }) => createMutation.mutate(label)}>
          <Form.Item name="label" rules={[{ required: true, min: 2, message: 'Укажите, где будет висеть' }]}>
            <Input placeholder="Например, Дежурка, 2 корпус" style={{ width: 260 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={createMutation.isPending}>Создать kiosk-ссылку</Button>
          </Form.Item>
        </Form>

        {freshUrl && (
          <Alert
            style={{ marginTop: 16 }}
            type="success"
            message="Ссылка создана — скопируйте её сейчас, позже полный адрес не показывается"
            description={
              <Space.Compact style={{ width: '100%' }}>
                <Input readOnly value={freshUrl} />
                <Button
                  icon={<CopyOutlined />}
                  onClick={() => {
                    void navigator.clipboard.writeText(freshUrl);
                    message.success('Скопировано');
                  }}
                >
                  Копировать
                </Button>
              </Space.Compact>
            }
          />
        )}
      </Card>

      <Card title="Kiosk-ссылки" loading={isLoading}>
        <Table<KioskToken>
          rowKey="id"
          dataSource={data}
          pagination={false}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Где', dataIndex: 'label' },
            { title: 'Создал', render: (_, r) => r.createdBy?.fullName ?? '—' },
            { title: 'Создана', dataIndex: 'createdAt', render: (v: string) => dayjs(v).format('DD.MM.YYYY') },
            {
              title: 'Последнее обращение',
              dataIndex: 'lastSeenAt',
              render: (v: string | null) => (v ? dayjs(v).format('DD.MM.YYYY HH:mm') : 'ещё не открывали'),
            },
            {
              title: 'Статус',
              render: (_, r) =>
                r.revokedAt ? <Tag color="default">отозвана</Tag> : <Tag color="green">действует</Tag>,
            },
            {
              title: '',
              width: 120,
              render: (_, r) =>
                r.revokedAt ? null : (
                  <Popconfirm title="Отозвать ссылку? Телевизор перестанет получать данные." onConfirm={() => revokeMutation.mutate(r.id)} okText="Отозвать" cancelText="Отмена">
                    <Button danger size="small">Отозвать</Button>
                  </Popconfirm>
                ),
            },
          ]}
        />
      </Card>
    </Space>
  );
}
