import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Form, Input, Spin, Typography } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../shared/auth/AuthContext';
import { loginAndLinkMax, loginViaMax } from '../shared/api/auth';
import { extractErrorMessage } from '../shared/api/errors';

// Тип минимальный — нужны только используемые здесь поля MAX Bridge SDK
// (https://dev.max.ru/docs/webapps/bridge). Скрипт подключён безусловно в index.html и вне
// клиента MAX просто не создаёт window.WebApp — этот файл единственное место, где мы его читаем.
declare global {
  interface Window {
    WebApp?: { initData?: string };
  }
}

interface LinkFormValues {
  username: string;
  password: string;
}

/**
 * Точка входа мини-приложения MAX (см. план "Мини-приложение MAX") — роут `/max`, вне
 * ProtectedRoute/AppLayout, но внутри AuthProvider (как и /wallboard). До входа сессии ещё
 * нет, поэтому вся логика входа сосредоточена здесь; после успеха это уже обычный Blik —
 * никакого отдельного урезанного интерфейса не строим.
 */
export function MaxAppBootstrap() {
  const { loginWithTokens } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<'checking' | 'not-max' | 'need-link' | 'error'>('checking');
  const [errorText, setErrorText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const initDataRef = useRef<string | null>(null);

  useEffect(() => {
    const initData = window.WebApp?.initData;
    if (!initData) {
      setState('not-max');
      return;
    }
    initDataRef.current = initData;

    loginViaMax(initData)
      .then((res) => {
        loginWithTokens(res.accessToken, res.user);
        navigate('/', { replace: true });
      })
      .catch((error: unknown) => {
        if (extractErrorMessage(error, '') === 'MAX_LINK_REQUIRED') {
          setState('need-link');
        } else {
          setErrorText(extractErrorMessage(error, 'Не удалось войти через MAX'));
          setState('error');
        }
      });
    // Однократно при монтировании — initData от MAX не меняется в течение сессии страницы.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLinkSubmit = async (values: LinkFormValues) => {
    const initData = initDataRef.current;
    if (!initData) return;
    setSubmitting(true);
    try {
      const res = await loginAndLinkMax(initData, values.username, values.password);
      loginWithTokens(res.accessToken, res.user);
      navigate('/', { replace: true });
    } catch (error) {
      setErrorText(extractErrorMessage(error, 'Неверный логин или пароль'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <img src="/logo-blue.png" alt="" style={{ width: 56, height: 56 }} />
        </div>
        <Typography.Title level={4} style={{ textAlign: 'center', marginTop: 0 }}>
          Blik
        </Typography.Title>

        {state === 'checking' && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <Spin />
          </div>
        )}

        {state === 'not-max' && (
          <Alert
            type="info"
            showIcon
            message="Открой это мини-приложение из кнопки в чат-боте MAX — отдельно эта страница не работает."
          />
        )}

        {state === 'error' && <Alert type="error" showIcon style={{ marginBottom: 16 }} message={errorText} />}

        {state === 'need-link' && (
          <>
            <Typography.Paragraph type="secondary" style={{ textAlign: 'center' }}>
              Первый вход через MAX — введи логин и пароль Blik один раз, дальше будет входить
              само.
            </Typography.Paragraph>
            {errorText && <Alert type="error" showIcon style={{ marginBottom: 16 }} message={errorText} />}
            <Form<LinkFormValues> layout="vertical" onFinish={onLinkSubmit} disabled={submitting}>
              <Form.Item name="username" label="Логин" rules={[{ required: true, message: 'Введите логин' }]}>
                <Input prefix={<UserOutlined />} autoFocus autoComplete="username" size="large" />
              </Form.Item>
              <Form.Item name="password" label="Пароль" rules={[{ required: true, message: 'Введите пароль' }]}>
                <Input.Password prefix={<LockOutlined />} autoComplete="current-password" size="large" />
              </Form.Item>
              <Form.Item style={{ marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
                  Войти и привязать MAX
                </Button>
              </Form.Item>
            </Form>
          </>
        )}
      </Card>
    </div>
  );
}
