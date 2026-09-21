import { Button, Card, Form, Input, Popconfirm, Switch, Table, App as AntdApp } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createCategory, deleteCategory, fetchCategories, updateCategory } from '../../shared/api/catalogs';
import { extractErrorMessage } from '../../shared/api/errors';

export function CategoriesPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ['categories', 'all'], queryFn: () => fetchCategories(true) });
  const [form] = Form.useForm<{ name: string }>();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['categories'] });

  const createMutation = useMutation({
    mutationFn: (name: string) => createCategory(name),
    onSuccess: () => { form.resetFields(); void invalidate(); message.success('Категория добавлена'); },
    onError: () => message.error('Не удалось добавить категорию (возможно, уже существует)'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateCategory(id, { isActive }),
    onSuccess: () => void invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => { void invalidate(); message.success('Категория удалена'); },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось удалить категорию')),
  });

  return (
    <Card title="Категории заявок">
      <Form form={form} layout="inline" onFinish={({ name }) => createMutation.mutate(name)} style={{ marginBottom: 16 }}>
        <Form.Item name="name" rules={[{ required: true, min: 2, message: 'Введите название' }]}>
          <Input placeholder="Например, Принтер" style={{ width: 240 }} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={createMutation.isPending}>Добавить</Button>
        </Form.Item>
      </Form>

      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Название', dataIndex: 'name' },
          { title: 'Slug', dataIndex: 'slug' },
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
                title="Удалить категорию?"
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
