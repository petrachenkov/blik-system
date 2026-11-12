import { Alert, App, Button, Card, Form, Input, Popconfirm, Select, Space, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../../shared/api/client';
import { extractErrorMessage } from '../../shared/api/errors';
import { useAuth } from '../../shared/auth/AuthContext';

type Week = 'red' | 'blue';
type Lesson = { subject: string; teacher: string; room: string; week?: Week };
type Slot = { day: string; pair: string; time: string; lessons: Lesson[] };
type Schedule = { groups: Record<string, { slots: Slot[] }> };
type Settings = { currentWeek: Week | null; announcement: string | null };

const settingsKey = ['college-schedule', 'settings'];
const scheduleKey = ['college-schedule', 'schedule'];

function ScheduleBroadcastCard() {
  const { message } = App.useApp();
  const [text, setText] = useState('');
  const broadcast = useMutation({
    mutationFn: async (body: string) => (await apiClient.post<{ count: number }>('/college-schedule/manage/broadcast', { text: body })).data,
    onSuccess: ({ count }) => {
      if (count === 0) {
        message.info('Пока нет подписчиков на объявления');
        return;
      }
      setText('');
      message.success(`Рассылка в очереди. Получателей: ${count}`);
    },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось создать рассылку')),
  });

  return (
    <Card title="Рассылка в MAX">
      <Typography.Paragraph type="secondary">
        Разовое сообщение от бота расписания для тех, кто включил объявления колледжа.
      </Typography.Paragraph>
      <Input.TextArea aria-label="Текст рассылки" rows={4} maxLength={2000} showCount disabled={broadcast.isPending}
        value={text} onChange={(event) => setText(event.target.value)} />
      <Popconfirm title="Отправить сообщение подписчикам в MAX?" okText="Отправить" cancelText="Отмена"
        disabled={!text.trim() || broadcast.isPending} onConfirm={() => broadcast.mutate(text.trim())}>
        <Button type="primary" disabled={!text.trim()} loading={broadcast.isPending} style={{ marginTop: 20 }}>Отправить в MAX</Button>
      </Popconfirm>
    </Card>
  );
}

function LessonEditor({ group, slot }: { group: string; slot: Slot }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{ lessons: Lesson[] }>();
  const update = useMutation({
    mutationFn: (lessons: Lesson[] | null) =>
      apiClient.put('/college-schedule/manage/lessons', { group, day: slot.day, pair: slot.pair, lessons }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scheduleKey });
      form.setFieldsValue({ lessons: queryClient.getQueryData<Schedule>(scheduleKey)
        ?.groups[group]?.slots.find(({ day, pair }) => day === slot.day && pair === slot.pair)?.lessons ?? [] });
      message.success('Расписание обновлено');
    },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось сохранить занятия')),
  });

  return (
    <Form form={form} layout="vertical" initialValues={{ lessons: slot.lessons }} onFinish={({ lessons }) => update.mutate(lessons ?? [])}>
      <Typography.Paragraph type="secondary">
        Правка действует каждую неделю по выбранному дню. Чтобы убрать пару, удалите все занятия из списка и сохраните.
      </Typography.Paragraph>
      <Form.List name="lessons">
        {(fields, { add, remove }) => (
          <Space orientation="vertical" style={{ width: '100%' }}>
            {fields.map((field, index) => (
              <Card key={field.key} size="small" title={`Занятие ${index + 1}`}>
                <Form.Item name={[field.name, 'subject']} label="Предмет" rules={[{ required: true, whitespace: true }]}>
                  <Input maxLength={200} />
                </Form.Item>
                <Form.Item name={[field.name, 'teacher']} label="Преподаватель">
                  <Input maxLength={150} />
                </Form.Item>
                <Form.Item name={[field.name, 'room']} label="Кабинет">
                  <Input maxLength={80} />
                </Form.Item>
                <Form.Item name={[field.name, 'week']} label="Неделя">
                  <Select allowClear placeholder="Каждую неделю" options={[
                    { value: 'red', label: '🔴 Красная' },
                    { value: 'blue', label: '🔵 Синяя' },
                  ]} />
                </Form.Item>
                <Button danger onClick={() => remove(field.name)}>Убрать занятие</Button>
              </Card>
            ))}
            <Button disabled={fields.length >= 12} onClick={() => add({ subject: '', teacher: '', room: '' })}>Добавить занятие</Button>
          </Space>
        )}
      </Form.List>
      <Space wrap style={{ marginTop: 16 }}>
        <Button type="primary" htmlType="submit" loading={update.isPending}>Сохранить пару</Button>
        <Button disabled={update.isPending} onClick={() => update.mutate(null)}>Вернуть из таблицы</Button>
      </Space>
    </Form>
  );
}

export function ScheduleManagementPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const [group, setGroup] = useState<string>();
  const [slotIndex, setSlotIndex] = useState<number>();
  const settings = useQuery({
    queryKey: settingsKey, queryFn: async () => (await apiClient.get<Settings>('/college-schedule/week')).data,
  });
  const schedule = useQuery({
    queryKey: scheduleKey, queryFn: async () => (await apiClient.get<Schedule>('/college-schedule/schedule')).data,
  });
  const saveSettings = useMutation({
    mutationFn: ({ field, value }: { field: 'week' | 'announcement'; value: string | null }) =>
      apiClient.put(`/college-schedule/manage/${field}`, field === 'week' ? { week: value } : { text: value }),
    onSuccess: async ({ data }) => {
      queryClient.setQueryData<Settings>(settingsKey, (previous) => ({ ...previous, ...data }));
      if ('announcement' in data) setDraft(null);
      await queryClient.invalidateQueries({ queryKey: settingsKey });
      message.success('Сохранено');
    },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось сохранить настройки')),
  });
  const slots = group ? schedule.data?.groups[group]?.slots ?? [] : [];
  const slot = slotIndex === undefined ? undefined : slots[slotIndex];
  const announcement = draft ?? settings.data?.announcement ?? '';
  const weekLabel = settings.data?.currentWeek === 'red' ? '🔴 Красная неделя'
    : settings.data?.currentWeek === 'blue' ? '🔵 Синяя неделя' : 'Цвет недели пока не задан';

  return (
    <main style={{ maxWidth: 860, padding: '24px 16px', margin: 'auto' }}>
      <Typography.Title level={2}>Управление расписанием</Typography.Title>
      <Space wrap style={{ marginBottom: 20 }}>
        <Button href="/schedule" target="_blank" rel="noopener">Открыть расписание</Button>
        {user?.role === 'ADMIN' ? <Link to="/">Вернуться в Blik</Link> : (
          <>
            <Button onClick={() => navigate('/tickets')}>Мои заявки</Button>
            <Button type="primary" onClick={() => navigate('/tickets/new')}>Новая заявка</Button>
            <Button onClick={() => void logout().catch(() => {}).finally(() => navigate('/login', { replace: true }))}>Выйти</Button>
          </>
        )}
      </Space>
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <ScheduleBroadcastCard />
        {settings.isError && <Alert type="error" showIcon message="Не удалось загрузить настройки расписания" />}
        <Card title="Цвет текущей недели" loading={settings.isLoading}>
          <Typography.Paragraph>{weekLabel}</Typography.Paragraph>
          <Typography.Paragraph type="secondary">Цвет сменится автоматически в следующий понедельник.</Typography.Paragraph>
          <Space wrap>
            <Button disabled={saveSettings.isPending} onClick={() => saveSettings.mutate({ field: 'week', value: 'red' })}>🔴 Красная</Button>
            <Button disabled={saveSettings.isPending} onClick={() => saveSettings.mutate({ field: 'week', value: 'blue' })}>🔵 Синяя</Button>
          </Space>
        </Card>
        <Card title="Объявление" loading={settings.isLoading}>
          <Typography.Paragraph type="secondary">Объявление появится над расписанием и придёт подписчикам в MAX.</Typography.Paragraph>
          <Input.TextArea aria-label="Текст объявления" rows={4} maxLength={2000} showCount
            value={announcement} onChange={(event) => setDraft(event.target.value)} />
          <Space wrap style={{ marginTop: 20 }}>
            <Button type="primary" disabled={!announcement.trim() || saveSettings.isPending}
              onClick={() => saveSettings.mutate({ field: 'announcement', value: announcement.trim() })}>Опубликовать</Button>
            <Button disabled={!settings.data?.announcement || saveSettings.isPending}
              onClick={() => saveSettings.mutate({ field: 'announcement', value: null })}>Снять объявление</Button>
          </Space>
        </Card>
        <Card title="Правка пары" loading={schedule.isLoading}>
          {schedule.isError ? <Alert type="warning" showIcon message="Расписание пока недоступно" /> : (
            <Space orientation="vertical" size={12} style={{ width: '100%' }}>
              <Select aria-label="Группа" placeholder="Выберите группу" showSearch style={{ width: '100%' }}
                value={group} onChange={(value) => { setGroup(value); setSlotIndex(undefined); }}
                options={Object.keys(schedule.data?.groups ?? {}).sort((a, b) => a.localeCompare(b, 'ru'))
                  .map((name) => ({ value: name, label: name }))} />
              <Select aria-label="День и пара" placeholder="Выберите день и пару" style={{ width: '100%' }}
                disabled={!group} value={slotIndex} onChange={setSlotIndex}
                options={slots.flatMap((item, index) => /^\d+$/.test(item.pair)
                  ? [{ value: index, label: `${item.day}, пара ${item.pair} · ${item.time}` }] : [])} />
              {group && slot && <LessonEditor key={JSON.stringify([group, slot.day, slot.pair])} group={group} slot={slot} />}
            </Space>
          )}
        </Card>
      </Space>
    </main>
  );
}
