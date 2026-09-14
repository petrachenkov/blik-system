import { Alert, Button, Card, Form, Popconfirm, Select, Space, Steps, Table, Tag, Typography, App as AntdApp } from 'antd';
import { EnvironmentOutlined, NumberOutlined, SendOutlined, TagOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import dayjs from 'dayjs';
import { useAuth } from '../../shared/auth/AuthContext';
import { fetchLocations } from '../../shared/api/catalogs';
import { cancelCartridgeRequest, collectCartridgeRequest, createCartridgeRequest, fetchCartridges } from '../../shared/api/cartridges';
import { fetchRefillEvents } from '../../shared/api/refillEvents';
import { extractErrorMessage } from '../../shared/api/errors';
import { CARTRIDGE_STATUS_COLORS, CARTRIDGE_STATUS_LABELS, isStaffRole } from '../../shared/labels';
import type { CartridgeRequest, CartridgeRequestStatus } from '../../shared/types';

interface FormValues {
  locationId: string;
}

export function CartridgesPage() {
  const { user } = useAuth();
  // modal — из контекстного App.useApp(), а не статический Modal.xxx(): статические методы
  // рендерятся вне дерева ConfigProvider и не подхватывают тёмную тему (см. фидбэк — код
  // в модалке оставался светлым при тёмной теме).
  const { message, modal } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const [status, setStatus] = useState<CartridgeRequestStatus | undefined>(undefined);
  const isStaff = user ? isStaffRole(user.role) : false;

  const { data: locations = [] } = useQuery({ queryKey: ['locations'], queryFn: () => fetchLocations() });
  const { data, isLoading } = useQuery({
    queryKey: ['cartridges', { status }],
    queryFn: () => fetchCartridges({ status }),
  });
  const { data: refillEvents = [] } = useQuery({ queryKey: ['refill-events'], queryFn: fetchRefillEvents });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['cartridges'] });

  const createMutation = useMutation({
    mutationFn: (values: FormValues) => createCartridgeRequest(values.locationId),
    onSuccess: (request) => {
      form.resetFields();
      void invalidate();
      modal.success({
        title: 'Заявка подана',
        content: (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <Typography.Paragraph>Наклейте этот код на картридж:</Typography.Paragraph>
            <Typography.Title level={1} style={{ letterSpacing: 8, margin: 0 }}>
              {request.code}
            </Typography.Title>
          </div>
        ),
      });
    },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось подать заявку')),
  });

  const collectMutation = useMutation({
    mutationFn: (id: string) => collectCartridgeRequest(id),
    onSuccess: () => { void invalidate(); message.success('Отмечено получение картриджа'); },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось отметить получение')),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelCartridgeRequest(id),
    onSuccess: () => { void invalidate(); message.success('Заявка отменена'); },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось отменить заявку')),
  });

  const nearestEvent = refillEvents
    .filter((e) => !e.isCancelled && dayjs(e.submissionDeadline).isAfter(dayjs()))
    .sort((a, b) => dayjs(a.submissionDeadline).valueOf() - dayjs(b.submissionDeadline).valueOf())[0];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {nearestEvent && (
        <Alert
          type="info"
          showIcon
          message="Ближайшая плановая заправка картриджей"
          description={
            <>
              Отправка — {dayjs(nearestEvent.scheduledAt).format('DD.MM.YYYY HH:mm')}. Сдать картриджи можно до{' '}
              <strong>{dayjs(nearestEvent.submissionDeadline).format('DD.MM.YYYY HH:mm')}</strong>.
              {nearestEvent.note && <div>{nearestEvent.note}</div>}
            </>
          }
        />
      )}

      <Card
        title="Заявки на заправку картриджей"
        extra={
          <Select
            allowClear
            placeholder="Статус"
            style={{ width: 200 }}
            value={status}
            onChange={setStatus}
            options={Object.entries(CARTRIDGE_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          />
        }
      >
        {isStaff ? (
          <>
            <Typography.Paragraph type="secondary">
              Укажите кабинет, откуда сдаётся картридж — система выдаст 4-значный код, его нужно наклеить на картридж.
            </Typography.Paragraph>
            <Form form={form} layout="inline" onFinish={(values) => createMutation.mutate(values)} style={{ marginBottom: 16 }}>
              <Form.Item name="locationId" rules={[{ required: true, message: 'Выберите кабинет' }]}>
                <Select
                  showSearch
                  placeholder="Кабинет, откуда сдаётся картридж"
                  style={{ width: 320 }}
                  optionFilterProp="label"
                  options={locations.map((l) => ({ value: l.id, label: `${l.building}, каб. ${l.room}${l.label ? ` — ${l.label}` : ''}` }))}
                />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={createMutation.isPending}>
                  Подать заявку
                </Button>
              </Form.Item>
            </Form>
          </>
        ) : (
          // Развёрнутый, "объясняющий" вариант для преподавателей (см. фидбэк — с первого
          // взгляда должно быть понятно, что и как делать): наглядные шаги + крупная форма.
          <div style={{ marginBottom: 24, maxWidth: 640 }}>
            <Steps
              size="small"
              current={0}
              items={[
                { title: 'Выберите кабинет', icon: <EnvironmentOutlined /> },
                { title: 'Получите код', icon: <NumberOutlined /> },
                { title: 'Наклейте код на картридж', icon: <TagOutlined /> },
              ]}
              style={{ marginBottom: 20 }}
            />
            <Form form={form} size="large" onFinish={(values) => createMutation.mutate(values)}>
              <Form.Item name="locationId" label="Кабинет, откуда сдаётся картридж" rules={[{ required: true, message: 'Выберите кабинет' }]}>
                <Select
                  showSearch
                  placeholder="Начните вводить корпус или номер кабинета"
                  optionFilterProp="label"
                  options={locations.map((l) => ({ value: l.id, label: `${l.building}, каб. ${l.room}${l.label ? ` — ${l.label}` : ''}` }))}
                />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={createMutation.isPending} block>
                  Подать заявку и получить код
                </Button>
              </Form.Item>
            </Form>
          </div>
        )}

        <Table<CartridgeRequest>
          rowKey="id"
          loading={isLoading}
          dataSource={data?.items ?? []}
          pagination={{ pageSize: 20, total: data?.total ?? 0 }}
          columns={[
            { title: '№', dataIndex: 'number', width: 130 },
            {
              title: 'Код',
              dataIndex: 'code',
              render: (code: string) => <Tag style={{ fontSize: 14, fontFamily: 'monospace' }}>{code}</Tag>,
            },
            { title: 'Локация', render: (_, r) => `${r.location.building}, каб. ${r.location.room}` },
            ...(isStaff ? [{ title: 'Преподаватель', render: (_: unknown, r: CartridgeRequest) => r.createdBy.fullName }] : []),
            {
              title: 'Статус',
              render: (_, r) => <Tag color={CARTRIDGE_STATUS_COLORS[r.status]}>{CARTRIDGE_STATUS_LABELS[r.status]}</Tag>,
            },
            { title: 'Забрал', render: (_, r) => r.collectedBy?.fullName ?? '—' },
            { title: 'Подана', dataIndex: 'createdAt', render: (v: string) => dayjs(v).format('DD.MM.YYYY HH:mm') },
            {
              title: '',
              render: (_, r) => (
                <Space>
                  {isStaff && r.status === 'NEW' && (
                    <Button size="small" onClick={() => collectMutation.mutate(r.id)} loading={collectMutation.isPending}>
                      Забрать на заправку
                    </Button>
                  )}
                  {r.status === 'NEW' && (user?.id === r.createdBy.id || user?.role === 'ADMIN') && (
                    <Popconfirm title="Отменить заявку?" onConfirm={() => cancelMutation.mutate(r.id)} okText="Отменить" cancelText="Нет">
                      <Button size="small" danger loading={cancelMutation.isPending}>
                        Отменить
                      </Button>
                    </Popconfirm>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Card>
    </Space>
  );
}
