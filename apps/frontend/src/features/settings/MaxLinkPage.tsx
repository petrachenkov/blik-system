import { Alert, Button, Card, Popconfirm, Space, Tag, Typography, App as AntdApp } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMaxLinkStatus, fetchMaxStatus, unlinkMax } from '../../shared/api/auth';
import { extractErrorMessage } from '../../shared/api/errors';

/**
 * Настройки привязки MAX (см. план "Мини-приложение MAX") — только статус и отвязка.
 * Сама привязка происходит автоматически при первом входе из мини-приложения (форма
 * логина внутри MAX, см. MaxAppBootstrap.tsx) — отдельного UI для неё здесь не нужно.
 */
export function MaxLinkPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();

  const { data: status, isLoading: statusLoading } = useQuery({ queryKey: ['max', 'status'], queryFn: fetchMaxStatus });
  const { data: link, isLoading: linkLoading } = useQuery({
    queryKey: ['max', 'link'],
    queryFn: fetchMaxLinkStatus,
    enabled: status?.configured,
  });

  const unlinkMutation = useMutation({
    mutationFn: unlinkMax,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['max', 'link'] });
      message.success('MAX отвязан');
    },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось отвязать MAX')),
  });

  return (
    <Card title="MAX" loading={statusLoading}>
      {status && !status.configured && (
        <Alert
          type="info"
          showIcon
          message="Интеграция с MAX не настроена на сервере — обратитесь к главному сисадмину."
        />
      )}

      {status?.configured && (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Открой мини-приложение Blik из чат-бота MAX и войди один раз своим логином и паролем —
            дальше оно будет открываться без пароля. Здесь можно только посмотреть статус и отвязать
            аккаунт (например, если потерял телефон).
          </Typography.Paragraph>

          {linkLoading ? null : link?.linked ? (
            <Space>
              <Tag icon={<CheckCircleOutlined />} color="success">
                Привязан
              </Tag>
              <Popconfirm
                title="Отвязать MAX?"
                description="Следующее открытие мини-приложения снова спросит логин и пароль."
                onConfirm={() => unlinkMutation.mutate()}
                okButtonProps={{ loading: unlinkMutation.isPending }}
              >
                <Button danger>Отвязать</Button>
              </Popconfirm>
            </Space>
          ) : (
            <Tag icon={<CloseCircleOutlined />}>Не привязан</Tag>
          )}
        </Space>
      )}
    </Card>
  );
}
