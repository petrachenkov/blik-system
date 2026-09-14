import { Button, Card, Form, Input, Popconfirm, Switch, Table, App as AntdApp } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLocation, deleteLocation, fetchLocations, updateLocation } from '../../shared/api/catalogs';
import { extractErrorMessage } from '../../shared/api/errors';

interface FormValues {
  building: string;
  room: string;
  label?: string;
}

export function LocationsPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ['locations', 'all'], queryFn: () => fetchLocations(true) });
  const [form] = Form.useForm<FormValues>();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['locations'] });

  const createMutation = useMutation({
    mutationFn: (values: FormValues) => createLocation(values),
    onSuccess: () => { form.resetFields(); void invalidate(); message.success('Локация добавлена'); },
    onError: () => message.error('Не удалось добавить локацию (возможно, уже существует)'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateLocation(id, { isActive }),
    onSuccess: () => void invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteLocation(id),
    onSuccess: () => { void invalidate(); message.success('Локация удалена'); },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось удалить локацию')),
  });

  return (
    <Card title="Локации (кабинеты, помещения)">
      <Form form={form} layout="inline" onFinish={(values) => createMutation.mutate(values)} style={{ marginBottom: 16 }}>
        <Form.Item name="building" rules={[{ required: true, message: 'Корпус' }]}>
          <Input placeholder="Корпус А" style={{ width: 140 }} />
        </Form.Item>
        <Form.Item name="room" rules={[{ required: true, message: 'Кабинет' }]}>
          <Input placeholder="204" style={{ width: 100 }} />
        </Form.Item>
        <Form.Item name="label">
          <Input placeholder="Название (необязательно)" style={{ width: 220 }} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={createMutation.isPending}>Добавить</Button>
        </Form.Item>
      </Form>

      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Корпус', dataIndex: 'building' },
          { title: 'Кабинет', dataIndex: 'room' },
          { title: 'Название', dataIndex: 'label' },
          {
            title: 'Активна',
            render: (_, record) => (
              <Switch checked={record.isActive} onChange={(isActive) => toggleMutation.mutate({ id: record.id, isActive })} />
            ),
          },
          {
            title: '',
            width: 80,
            render: (_, record) => (
              <Popconfirm
                title="Удалить локацию?"
                description="Если она уже используется в заявках, удаление будет отклонено — деактивируйте её вместо этого."
                onConfirm={() => deleteMutation.mutate(record.id)}
                okText="Удалить"
                cancelText="Отмена"
              >
                <Button danger type="text" icon={<DeleteOutlined />} loading={deleteMutation.isPending} />
              </Popconfirm>
            ),
          },
        ]}
      />
    </Card>
  );
}
