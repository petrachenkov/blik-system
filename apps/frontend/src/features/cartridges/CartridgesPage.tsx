import { Alert, Button, Card, Form, Popconfirm, Select, Space, Steps, Table, Tag, Typography, App as AntdApp, theme } from 'antd';
import { DownloadOutlined, EnvironmentOutlined, InfoCircleOutlined, NumberOutlined, SendOutlined, TagOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import dayjs from 'dayjs';
import { useAuth } from '../../shared/auth/AuthContext';
import { fetchLocations } from '../../shared/api/catalogs';
import {
  cancelCartridgeRequest,
  collectCartridgeRequest,
  createCartridgeRequest,
  downloadCartridgeLabels,
  fetchCartridges,
} from '../../shared/api/cartridges';
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
  const { token } = theme.useToken();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const [status, setStatus] = useState<CartridgeRequestStatus | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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
            <Typography.Paragraph>Ваш код:</Typography.Paragraph>
            <Typography.Title level={1} style={{ letterSpacing: 8, margin: 0 }}>
              {request.code}
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
              Наклейку с этим кодом сотрудник техподдержки напечатает и наклеит сам, когда
              придёт забрать картридж — вам ничего писать и клеить не нужно, просто сверьте
              код при передаче.
            </Typography.Paragraph>
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

  // Печать этикеток (см. план "Печать этикеток картриджей") — Label Expert сам не умеет
  // выбирать строки для печати, печатает всё, что видит в файле, поэтому выбор "что
  // печатать" делается здесь — галочками в этой таблице, один шаг: выделил → скачал.
  const downloadLabelsMutation = useMutation({
    mutationFn: () => downloadCartridgeLabels(selectedIds),
    onSuccess: () => setSelectedIds([]),
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось скачать файл этикеток')),
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
          // взгляда должно быть понятно, что и как делать): инструкция вынесена в заметный
          // цветной блок над формой (было — маленькие Steps без акцента, терялись на странице,
          // см. фидбэк "сделай более выделяющуюся инструкцию, чтобы была заметна").
          <div style={{ marginBottom: 24, maxWidth: 640 }}>
            <div
              style={{
                background: token.colorPrimaryBg,
                border: `1px solid ${token.colorPrimaryBorder}`,
                borderRadius: token.borderRadiusLG,
                padding: '18px 20px',
                marginBottom: 20,
              }}
            >
              <Typography.Title level={5} style={{ margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8, color: token.colorPrimaryText }}>
                <InfoCircleOutlined /> Как сдать картридж на заправку
              </Typography.Title>
              {/* Вертикально всегда, не только на узких экранах — третий шаг заметно длиннее
                  первых двух, и в горизонтальной раскладке при ограниченной ширине блока
                  (maxWidth: 640 у обёртки) слова в нём рвутся посередине независимо от
                  ширины самого экрана (см. фидбэк со скриншотом). */}
              <Steps
                current={0}
                direction="vertical"
                items={[
                  { title: 'Выберите кабинет', icon: <EnvironmentOutlined /> },
                  { title: 'Получите код', icon: <NumberOutlined /> },
                  { title: 'Сотрудник заберёт картридж и сам наклеит код', icon: <TagOutlined /> },
                ]}
              />
            </div>
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

        {isStaff && selectedIds.length > 0 && (
          <Space style={{ marginBottom: 12 }}>
            <Typography.Text>Выбрано: {selectedIds.length}</Typography.Text>
            <Button
              size="small"
              type="primary"
              icon={<DownloadOutlined />}
              loading={downloadLabelsMutation.isPending}
              onClick={() => downloadLabelsMutation.mutate()}
            >
              Скачать этикетки
            </Button>
            <Button size="small" type="text" onClick={() => setSelectedIds([])}>
              Снять выделение
            </Button>
          </Space>
        )}

        <Table<CartridgeRequest>
          rowKey="id"
          loading={isLoading}
          dataSource={data?.items ?? []}
          pagination={{ pageSize: 20, total: data?.total ?? 0 }}
          // 6-7 колонок не помещаются на мобильном без этого — таблица просто раздвигала всю
          // страницу вширь (см. фидбэк со скриншотом, "всё поехало"). Со scroll она остаётся
          // в границах карточки и скроллится сама по себе горизонтально.
          scroll={{ x: 'max-content' }}
          rowSelection={
            isStaff
              ? {
                  selectedRowKeys: selectedIds,
                  onChange: (keys) => setSelectedIds(keys as string[]),
                  getCheckboxProps: (r) => ({ disabled: r.status !== 'NEW' }),
                }
              : undefined
          }
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
