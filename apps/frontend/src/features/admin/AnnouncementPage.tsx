import { Button, Card, Form, Input, Popconfirm, Space, Typography, App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { clearAnnouncement, fetchActiveAnnouncement, publishAnnouncement } from '../../shared/api/announcements';
import { extractErrorMessage } from '../../shared/api/errors';

interface FormValues {
  text: string;
}

/** Общесайтовый баннер (не привязан к заявке) — виден всем сразу после входа, пока
 * не убран отсюда же. Отличается от точечной рассылки постоянной видимостью (см. план). */
export function AnnouncementPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  const { data, isLoading } = useQuery({ queryKey: ['announcement'], queryFn: fetchActiveAnnouncement });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['announcement'] });

  const publishMutation = useMutation({
    mutationFn: (values: FormValues) => publishAnnouncement(values.text),
    onSuccess: () => { void invalidate(); message.success('Баннер опубликован'); },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось опубликовать баннер')),
  });

  const clearMutation = useMutation({
    mutationFn: clearAnnouncement,
    onSuccess: () => { form.resetFields(); void invalidate(); message.success('Баннер убран'); },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось убрать баннер')),
  });

  return (
    <Card title="Общее объявление" loading={isLoading} style={{ maxWidth: 640 }}>
      <Typography.Paragraph type="secondary">
        Текст будет виден всем пользователям сразу после входа в систему, на всех страницах — пока вы сами его не уберёте.
      </Typography.Paragraph>

      {data?.text && (
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          Сейчас опубликовано: «{data.text}» ({dayjs(data.updatedAt).format('DD.MM.YYYY HH:mm')})
        </Typography.Paragraph>
      )}

      <Form<FormValues> form={form} layout="vertical" initialValues={{ text: data?.text ?? undefined }} onFinish={(values) => publishMutation.mutate(values)}>
        <Form.Item name="text" label="Текст объявления" rules={[{ required: true, message: 'Введите текст' }]}>
          <Input.TextArea rows={4} placeholder="Например, сегодня с 18:00 плановые работы в сети" />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={publishMutation.isPending}>
              Опубликовать
            </Button>
            <Popconfirm title="Убрать баннер у всех?" onConfirm={() => clearMutation.mutate()} okText="Убрать" cancelText="Отмена">
              <Button danger loading={clearMutation.isPending} disabled={!data?.text}>
                Убрать баннер
              </Button>
            </Popconfirm>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
}
