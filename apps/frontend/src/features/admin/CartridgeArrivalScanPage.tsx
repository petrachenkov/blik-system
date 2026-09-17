import { useRef, useState } from 'react';
import { Alert, Card, Input, List, Tag, Typography, App as AntdApp } from 'antd';
import type { InputRef } from 'antd';
import { QrcodeOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { scanCartridgeArrival } from '../../shared/api/cartridges';
import { extractErrorMessage } from '../../shared/api/errors';
import type { CartridgeRequest } from '../../shared/types';

interface ScanResult {
  key: string;
  ok: boolean;
  text: string;
  at: string;
}

/**
 * Сканирование QR при возврате картриджей с заправки (см. план "Печать этикеток картриджей",
 * часть B). Сканер штрихкодов эмулирует клавиатуру и сам шлёт Enter после кода — поэтому
 * здесь просто один большой автофокусный Input, без отдельной кнопки "Сканировать".
 */
export function CartridgeArrivalScanPage() {
  const { message } = AntdApp.useApp();
  const inputRef = useRef<InputRef>(null);
  const [value, setValue] = useState('');
  const [results, setResults] = useState<ScanResult[]>([]);

  const scanMutation = useMutation({
    mutationFn: (code: string) => scanCartridgeArrival(code),
    onSuccess: (request: CartridgeRequest) => {
      setResults((prev) => [
        {
          key: `${request.id}-${Date.now()}`,
          ok: true,
          text: `${request.code} — ${request.location.building}, каб. ${request.location.room} (${request.createdBy.fullName})`,
          at: dayjs().format('HH:mm:ss'),
        },
        ...prev,
      ]);
      message.success(`Код ${request.code} принят`);
    },
    onError: (error, code) => {
      setResults((prev) => [
        { key: `err-${Date.now()}`, ok: false, text: `${code} — ${extractErrorMessage(error, 'не удалось принять')}`, at: dayjs().format('HH:mm:ss') },
        ...prev,
      ]);
      message.error(extractErrorMessage(error, 'Не удалось отметить прибытие'));
    },
    onSettled: () => {
      setValue('');
      // Возвращаем фокус в поле, чтобы можно было сканировать одно за другим, не трогая мышь.
      inputRef.current?.focus();
    },
  });

  const submit = () => {
    const code = value.trim();
    if (code.length !== 4) {
      message.warning('Код должен состоять из 4 цифр');
      return;
    }
    scanMutation.mutate(code);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
      <Card title="Приём картриджей с заправки">
        <Typography.Paragraph type="secondary">
          Наведите сканер на QR на этикетке картриджа (или введите код вручную и нажмите Enter) —
          заявка должна быть в статусе «Отправлен».
        </Typography.Paragraph>
        <Input
          ref={inputRef}
          autoFocus
          size="large"
          prefix={<QrcodeOutlined />}
          placeholder="Код с этикетки"
          value={value}
          maxLength={4}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
          onPressEnter={submit}
          disabled={scanMutation.isPending}
        />
      </Card>

      {results.length > 0 && (
        <Card title="Последние сканирования в этой сессии" size="small">
          <List
            size="small"
            dataSource={results.slice(0, 20)}
            renderItem={(r) => (
              <List.Item>
                <Alert
                  style={{ width: '100%' }}
                  type={r.ok ? 'success' : 'error'}
                  showIcon
                  message={
                    <span>
                      <Tag color={r.ok ? 'green' : 'red'}>{r.at}</Tag> {r.text}
                    </span>
                  }
                />
              </List.Item>
            )}
          />
        </Card>
      )}
    </div>
  );
}
