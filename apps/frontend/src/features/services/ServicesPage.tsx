import { useRef, useState } from 'react';
import { Alert, App, Button, Card, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Spin, Switch, Tag, Typography, Upload } from 'antd';
import { AppstoreOutlined, DeleteOutlined, EditOutlined, ExportOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../shared/auth/AuthContext';
import { deleteLocalService, fetchLocalServices, saveLocalService, setLocalServiceVisibility, type LocalService, type LocalServiceInput } from '../../shared/api/localServices';
import { extractErrorMessage } from '../../shared/api/errors';

const DEFAULTS: LocalServiceInput = { name: '', description: '', url: '', iconType: 'emoji', emoji: '🔗', imageData: null, sortOrder: 0, isActive: true };
const EMOJI = ['🔗', '📚', '📅', '📁', '🖨️', '💻', '✉️', '🎓', '📊', '🛠️', '🌐', '🏫'];

function ServiceIcon({ service }: { service: Pick<LocalServiceInput, 'iconType' | 'imageData' | 'emoji'> }) {
  return <span className="service-icon" aria-hidden="true">{service.iconType === 'image' && service.imageData ? <img src={service.imageData} alt="" /> : service.emoji || '🔗'}</span>;
}

export function ServicesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<{ service?: LocalService } | null>(null);
  const [form] = Form.useForm<LocalServiceInput>();
  const iconType = Form.useWatch('iconType', form) ?? 'emoji';
  const emoji = Form.useWatch('emoji', form) ?? '🔗';
  const imageData = Form.useWatch('imageData', form);
  const [readingFile, setReadingFile] = useState(false);
  const savingRef = useRef(false);
  const [showHidden, setShowHidden] = useState(false);
  const { data: services = [], isLoading, isError, refetch } = useQuery({ queryKey: ['local-services', showHidden], queryFn: () => fetchLocalServices(showHidden) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['local-services'] });
  const fail = (error: unknown) => message.error(extractErrorMessage(error, 'Не удалось сохранить изменения'));

  const save = useMutation({ mutationFn: (values: LocalServiceInput) => saveLocalService(editor?.service?.id, { ...values, description: values.description ?? '', emoji: values.emoji ?? '🔗', imageData: values.iconType === 'image' ? values.imageData : null }),
    onSuccess: () => { setEditor(null); void invalidate(); message.success('Сервис сохранён'); }, onError: fail, onSettled: () => { savingRef.current = false; } });
  const visibility = useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => setLocalServiceVisibility(id, active), onSuccess: () => void invalidate(), onError: fail });
  const remove = useMutation({ mutationFn: deleteLocalService, onSuccess: () => { void invalidate(); message.success('Сервис удалён'); }, onError: fail });

  const openEditor = (service?: LocalService) => { form.setFieldsValue(service ? { name: service.name, description: service.description, url: service.url, iconType: service.iconType, emoji: service.emoji, imageData: service.imageData, sortOrder: service.sortOrder, isActive: service.isActive } : { ...DEFAULTS }); setEditor({ service }); };

  const readImage = async (file: File) => {
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 512 * 1024) { message.error('Выберите PNG, JPEG, WebP или GIF размером до 512 КБ'); return Upload.LIST_IGNORE; }
    setReadingFile(true);
    try {
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
      form.setFieldValue('imageData', data);
    } catch { message.error('Не удалось прочитать картинку'); } finally { setReadingFile(false); }
    return Upload.LIST_IGNORE;
  };

  return <div className="services-page">
    <div className="services-heading">
      <div><Typography.Title level={3} style={{ margin: 0 }}>Сервисы колледжа</Typography.Title><Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>Быстрый переход к внутренним ресурсам. Для некоторых сервисов нужна сеть колледжа.</Typography.Paragraph></div>
      {isAdmin && <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>Добавить сервис</Button>}
    </div>
    {isAdmin && <Space wrap style={{ marginBottom: 20 }}><Switch checked={showHidden} onChange={setShowHidden} aria-label="Показать скрытые сервисы" /><Typography.Text>Показать скрытые сервисы</Typography.Text></Space>}
    {isError ? <Alert type="error" showIcon title="Не удалось загрузить сервисы" action={<Button onClick={() => void refetch()}>Повторить</Button>} /> : <Spin spinning={isLoading}>
      {!isLoading && !services.length && <Card><Empty image={<AppstoreOutlined style={{ fontSize: 48 }} />} description="Добавьте первый сервис. Панель доступна только сисадминам." /></Card>}
      <div className="services-grid">{services.map((service) => <Card key={service.id} className="service-card">
        <a className="service-link" href={service.url} target="_blank" rel="noopener noreferrer">
          <ServiceIcon service={service} /><span className="service-name">{service.name}</span>
          {service.description && <span className="service-description">{service.description}</span>}
          <span className="service-open">Открыть <ExportOutlined /></span>
        </a>
        {isAdmin && <div className="service-controls">
          <Space wrap><Switch aria-label={`Показывать ${service.name}`} checked={service.isActive} loading={visibility.isPending && visibility.variables?.id === service.id} onChange={(active) => visibility.mutate({ id: service.id, active })} /><span>{service.isActive ? 'В панели' : <Tag>Скрыт</Tag>}</span></Space>
          <Space wrap><Button icon={<EditOutlined />} onClick={() => openEditor(service)}>Изменить</Button><Popconfirm title={`Удалить сервис «${service.name}»?`} description="Ссылка исчезнет из панели сервисов." okText="Удалить" cancelText="Отмена" onConfirm={() => remove.mutate(service.id)}><Button aria-label={`Удалить ${service.name}`} danger icon={<DeleteOutlined />} loading={remove.isPending && remove.variables === service.id} /></Popconfirm></Space>
        </div>}
      </Card>)}</div>
    </Spin>}
    <Modal title={editor?.service ? 'Изменить сервис' : 'Добавить сервис'} open={editor !== null} onCancel={() => !save.isPending && !readingFile && setEditor(null)} onOk={() => form.submit()} okText="Сохранить" cancelText="Отмена" confirmLoading={save.isPending} okButtonProps={{ disabled: readingFile }} cancelButtonProps={{ disabled: save.isPending || readingFile }} maskClosable={!save.isPending && !readingFile} closable={!save.isPending && !readingFile}>
      <Form form={form} layout="vertical" onFinish={(values) => { if (savingRef.current) return; if (values.iconType === 'image' && !values.imageData) { message.error('Загрузите картинку перед сохранением'); return; } savingRef.current = true; save.mutate(values); }} disabled={save.isPending || readingFile}>
        <Form.Item name="name" label="Название" rules={[{ required: true, whitespace: true, message: 'Введите название' }, { max: 80 }]}><Input maxLength={80} placeholder="Например, Электронная библиотека" /></Form.Item>
        <Form.Item name="url" label="Ссылка" extra="Можно указать локальный адрес: http://192.168.1.10 или https://library.local" rules={[{ required: true, message: 'Введите ссылку' }, { validator: (_, value: string) => { try { const url = new URL(value?.trim()); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(); return Promise.resolve(); } catch { return Promise.reject(new Error('Укажите ссылку с http:// или https:// без логина и пароля')); } } }]}><Input maxLength={2000} placeholder="https://" inputMode="url" autoCapitalize="none" /></Form.Item>
        <Form.Item name="description" label="Краткое описание (необязательно)"><Input.TextArea maxLength={240} showCount autoSize={{ minRows: 2, maxRows: 4 }} /></Form.Item>
        <Form.Item name="iconType" label="Значок"><Select options={[{ value: 'emoji', label: 'Эмодзи' }, { value: 'image', label: 'Своя картинка' }]} /></Form.Item>
        <div className="service-icon-editor"><ServiceIcon service={{ iconType, emoji, imageData }} />
          {iconType === 'emoji' ? <div><Form.Item name="emoji" label="Эмодзи" rules={[{ required: true, whitespace: true, message: 'Выберите или вставьте эмодзи' }]} style={{ marginBottom: 8 }}><Input maxLength={32} /></Form.Item><div className="service-emoji-options">{EMOJI.map((value) => <Button key={value} aria-label={`Выбрать ${value}`} onClick={() => form.setFieldValue('emoji', value)}>{value}</Button>)}</div></div>
          : <div><Upload accept="image/png,image/jpeg,image/webp,image/gif" showUploadList={false} beforeUpload={readImage}><Button icon={<UploadOutlined />} loading={readingFile}>Выбрать картинку</Button></Upload><Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>PNG, JPEG, WebP или GIF до 512 КБ.</Typography.Paragraph></div>}
        </div>
        <Form.Item name="imageData" hidden><Input /></Form.Item>
        {iconType === 'image' && !imageData && <Typography.Paragraph type="secondary">Загрузите картинку перед сохранением.</Typography.Paragraph>}
        <Form.Item name="sortOrder" label="Порядок в панели" extra="Меньшие числа — в начале списка." rules={[{ required: true }]}><InputNumber min={0} max={10000} precision={0} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="isActive" valuePropName="checked" label="Показывать в панели"><Switch /></Form.Item>
      </Form>
    </Modal>
  </div>;
}
