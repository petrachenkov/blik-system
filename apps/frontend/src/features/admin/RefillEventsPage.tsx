import { Button, Card, DatePicker, Form, Input, Popconfirm, Table, Tag, App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { createRefillEvent, fetchRefillEvents, updateRefillEvent } from '../../shared/api/refillEvents';
import { extractErrorMessage } from '../../shared/api/errors';
import type { RefillEvent } from '../../shared/types';

interface FormValues {
  scheduledAt: Dayjs;
  submissionDeadline: Dayjs;
  note?: string;
}

export function RefillEventsPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  const { data = [], isLoading } = useQuery({ queryKey: ['refill-events'], queryFn: fetchRefillEvents });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['refill-events'] });

  const createMutation = useMutation({
    mutationFn: (values: FormValues) =>
      createRefillEvent({
        scheduledAt: values.scheduledAt.toISOString(),
        submissionDeadline: values.submissionDeadline.toISOString(),
        note: values.note,
      }),
    onSuccess: () => {
      form.resetFields();
      void invalidate();
      message.success('Плановая заправка создана, преподаватели уведомлены');
    },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось создать плановую заправку')),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => updateRefillEvent(id, { isCancelled: true }),
    onSuccess: () => { void invalidate(); message.success('Плановая заправка отменена'); },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось отменить')),
  });

  return (
    <Card title="Плановые заправки картриджей">
      <Form<FormValues> form={form} layout="inline" onFinish={(values) => createMutation.mutate(values)} style={{ marginBottom: 16, rowGap: 8 }}>
        <Form.Item name="scheduledAt" label="Отправка" rules={[{ required: true, message: 'Укажите дату отправки' }]}>
          <DatePicker showTime format="DD.MM.YYYY HH:mm" />
        </Form.Item>
        <Form.Item
          name="submissionDeadline"
          label="Сдать до"
          rules={[{ required: true, message: 'Укажите дедлайн сдачи' }]}
        >
          <DatePicker showTime format="DD.MM.YYYY HH:mm" />
        </Form.Item>
        <Form.Item name="note">
          <Input placeholder="Примечание (необязательно)" style={{ width: 240 }} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={createMutation.isPending}>
            Создать
          </Button>
        </Form.Item>
      </Form>

      <Table<RefillEvent>
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Отправка', dataIndex: 'scheduledAt', render: (v: string) => dayjs(v).format('DD.MM.YYYY HH:mm') },
          { title: 'Сдать до', dataIndex: 'submissionDeadline', render: (v: string) => dayjs(v).format('DD.MM.YYYY HH:mm') },
          { title: 'Примечание', dataIndex: 'note', render: (v: string | null) => v ?? '—' },
          { title: 'Создал', render: (_, r) => r.createdBy.fullName },
          {
            title: 'Статус',
            render: (_, r) =>
              r.isCancelled ? <Tag>Отменена</Tag> : dayjs(r.submissionDeadline).isBefore(dayjs()) ? <Tag color="default">Завершена</Tag> : <Tag color="green">Активна</Tag>,
          },
          {
            title: '',
            render: (_, r) =>
              !r.isCancelled && (
                <Popconfirm title="Отменить плановую заправку?" onConfirm={() => cancelMutation.mutate(r.id)} okText="Отменить" cancelText="Нет">
                  <Button size="small" danger loading={cancelMutation.isPending}>
                    Отменить
                  </Button>
                </Popconfirm>
              ),
          },
        ]}
      />
    </Card>
  );
}
