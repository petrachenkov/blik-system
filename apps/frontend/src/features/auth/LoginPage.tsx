import { useRef, useState } from 'react';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { ThemeToggle } from '../../shared/theme/ThemeToggle';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../shared/auth/AuthContext';
import { fetchMaintenance } from '../../shared/api/system';
import { isAxiosError } from 'axios';
import { extractErrorMessage } from '../../shared/api/errors';

interface LoginFormValues {
  username: string;
  password: string;
}

function loginErrorMessage(error: unknown): string {
  if (!isAxiosError(error)) return 'Не удалось войти. Попробуйте позже.';
  const response = error.response;
  if (!response) return 'Сервер не ответил. Проверьте подключение и попробуйте снова.';
  switch (response.status) {
    case 400: return 'Сервер не смог обработать форму входа. Сообщите администратору (HTTP 400).';
    case 401: return extractErrorMessage(error, 'Неверный логин или пароль');
    case 409: return extractErrorMessage(error, 'Этот MAX-аккаунт уже привязан к другому пользователю');
    case 429: return 'Слишком много попыток входа. Подождите минуту и попробуйте снова.';
    case 503: return extractErrorMessage(error, 'Сервер временно недоступен. Попробуйте позже.');
    default: return `Не удалось войти. Попробуйте позже (HTTP ${response.status}).`;
  }
}

export function LoginPage() {
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string>();
  const isSubmittingRef = useRef(false);
  const { data: maintenance } = useQuery({ queryKey: ['system', 'maintenance'], queryFn: fetchMaintenance });

  const onFinish = async (values: LoginFormValues) => {
    if (isSubmittingRef.current || isLoading) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    setLoginError(undefined);

    try {
      await login(values.username.trim(), values.password);
      navigate('/', { replace: true });
    } catch (error) {
      setLoginError(loginErrorMessage(error));
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #16233d 0%, #2b6cb0 100%)',
        position: 'relative',
      }}
    >
      <div style={{ position: 'absolute', top: 16, right: 16, color: '#fff' }}>
        <ThemeToggle />
      </div>
      <Card style={{ width: 380, boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <img src="/logo-blue.png" alt="" style={{ width: 64, height: 64 }} />
        </div>
        <Typography.Title level={3} style={{ textAlign: 'center', marginBottom: 4, marginTop: 0 }}>
          Blik
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ textAlign: 'center', marginBottom: 24 }}>
          Заявки на техническое обслуживание
        </Typography.Paragraph>
        {maintenance?.enabled && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            message={maintenance.message || 'Идут технические работы. Вход временно ограничен.'}
          />
        )}
        {loginError && <Alert type="error" showIcon style={{ marginBottom: 16 }} message={loginError} />}
        <Form<LoginFormValues> layout="vertical" onFinish={onFinish} disabled={isLoading || submitting}>
          <Form.Item name="username" label="Логин" rules={[{ required: true, whitespace: true, message: 'Введите логин' }]}>
            <Input prefix={<UserOutlined />} autoFocus autoComplete="username" size="large" />
          </Form.Item>
          <Form.Item name="password" label="Пароль" rules={[{ required: true, message: 'Введите пароль' }]}>
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" size="large" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 12 }}>
            <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
              Войти
            </Button>
          </Form.Item>
        </Form>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Вход по учётной записи Active Directory. Логин совпадает с доменной учётной записью.
        </Typography.Text>
      </Card>
    </div>
  );
}
