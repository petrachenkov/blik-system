import { Button, Card, Form, Input, Radio, Select, Typography, App as AntdApp } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { fetchUsers } from '../../shared/api/catalogs';
import { sendBroadcastNotification } from '../../shared/api/notifications';
import { extractErrorMessage } from '../../shared/api/errors';

interface FormValues {
  scope: 'ALL' | 'USER';
  targetUserId?: string;
  title: string;
  body: string;
}

export function BroadcastNotificationPage() {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<FormValues>();
  const scope = Form.useWatch('scope', form) ?? 'ALL';

  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });

  const sendMutation = useMutation({
    mutationFn: (values: FormValues) =>
      sendBroadcastNotification({
        title: values.title,
        body: values.body,
        targetUserId: values.scope === 'USER' ? values.targetUserId : undefined,
      }),
    onSuccess: () => {
      form.resetFields();
      message.success('Уведомление отправлено');
    },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось отправить уведомление')),
  });

  return (
    <Card title="Рассылка уведомлений" style={{ maxWidth: 600 }}>
      <Typography.Paragraph type="secondary">
        Свободный текст, который придёт получателю как обычное уведомление в системе.
      </Typography.Paragraph>
      <Form<FormValues>
        form={form}
        layout="vertical"
        initialValues={{ scope: 'ALL' }}
        onFinish={(values) => sendMutation.mutate(values)}
      >
        <Form.Item name="scope" label="Кому">
          <Radio.Group
            options={[
              { value: 'ALL', label: 'Всем пользователям' },
              { value: 'USER', label: 'Конкретному пользователю' },
            ]}
          />
        </Form.Item>

        {scope === 'USER' && (
          <Form.Item name="targetUserId" label="Получатель" rules={[{ required: true, message: 'Выберите получателя' }]}>
            <Select
              showSearch
              placeholder="Выберите пользователя"
              optionFilterProp="label"
              options={users.map((u) => ({ value: u.id, label: `${u.fullName} (${u.username})` }))}
            />
          </Form.Item>
        )}

        <Form.Item name="title" label="Заголовок" rules={[{ required: true, message: 'Введите заголовок' }]}>
          <Input placeholder="Например, Плановые работы в сети" />
        </Form.Item>
        <Form.Item name="body" label="Текст сообщения" rules={[{ required: true, message: 'Введите текст' }]}>
          <Input.TextArea rows={5} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={sendMutation.isPending}>
            Отправить
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}
