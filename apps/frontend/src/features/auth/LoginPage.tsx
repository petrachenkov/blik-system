import { useRef, useState } from 'react';
import { Alert, Button, Card, Form, Input, Typography, App as AntdApp } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { ThemeToggle } from '../../shared/theme/ThemeToggle';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../shared/auth/AuthContext';
import { fetchMaintenance } from '../../shared/api/system';
import { isAxiosError } from 'axios';

interface LoginFormValues {
  username: string;
  password: string;
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  const [submitting, setSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const { data: maintenance } = useQuery({ queryKey: ['system', 'maintenance'], queryFn: fetchMaintenance });

  const onFinish = async (values: LoginFormValues) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSubmitting(true);

    try {
      await login(values.username, values.password);
      navigate('/', { replace: true });
    } catch (error) {
      let text = 'Не удалось войти. Попробуйте позже.';
      if (isAxiosError(error) && error.response?.status === 401) text = 'Неверный логин или пароль';
      else if (isAxiosError(error) && error.response?.status === 503) {
        text = (error.response.data as { message?: string })?.message ?? 'Система на техническом обслуживании';
      }
      message.error(text);
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
        <Form<LoginFormValues> layout="vertical" onFinish={onFinish} disabled={submitting}>
          <Form.Item name="username" label="Логин" rules={[{ required: true, message: 'Введите логин' }]}>
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
