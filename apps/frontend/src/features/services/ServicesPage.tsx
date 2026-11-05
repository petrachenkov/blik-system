import { useRef, useState, type CSSProperties } from 'react';
import { Alert, App, Button, Card, Dropdown, Empty, Form, Input, InputNumber, Modal, Segmented, Select, Spin, Switch, Typography, Upload, theme } from 'antd';
import { AppstoreOutlined, CopyOutlined, DeleteOutlined, EditOutlined, ExportOutlined, EyeInvisibleOutlined, EyeOutlined, MoreOutlined, PlusOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
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
  const { message, modal } = App.useApp();
  const { token } = theme.useToken();
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<{ service?: LocalService } | null>(null);
  const [form] = Form.useForm<LocalServiceInput>();
  const iconType = Form.useWatch('iconType', form) ?? 'emoji';
  const emoji = Form.useWatch('emoji', form) ?? '🔗';
  const imageData = Form.useWatch('imageData', form);
  const [readingFile, setReadingFile] = useState(false);
  const savingRef = useRef(false);
  const [showHidden, setShowHidden] = useState(false);
  const [search, setSearch] = useState('');
  const { data: services = [], isLoading, isError, refetch } = useQuery({ queryKey: ['local-services', showHidden], queryFn: () => fetchLocalServices(showHidden) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['local-services'] });
  const fail = (error: unknown) => message.error(extractErrorMessage(error, 'Не удалось сохранить изменения'));

  const save = useMutation({ mutationFn: (values: LocalServiceInput) => saveLocalService(editor?.service?.id, { ...values, description: values.description ?? '', emoji: values.emoji ?? '🔗', imageData: values.iconType === 'image' ? values.imageData : null }),
    onSuccess: () => { setEditor(null); void invalidate(); message.success('Сервис сохранён'); }, onError: fail, onSettled: () => { savingRef.current = false; } });
  const visibility = useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => setLocalServiceVisibility(id, active), onSuccess: () => void invalidate(), onError: fail });
  const remove = useMutation({ mutationFn: deleteLocalService, onSuccess: () => { void invalidate(); message.success('Сервис удалён'); }, onError: fail });
  const filtered = services.filter((service) => `${service.name} ${service.description} ${service.url}`.toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru')));
  const host = (url: string) => { try { return new URL(url).host; } catch { return url; } };
  const copyLink = async (url: string) => {
    try { await navigator.clipboard.writeText(url); message.success('Ссылка скопирована'); }
    catch { modal.info({ title: 'Ссылка на сервис', content: <Input readOnly value={url} onFocus={(event) => event.target.select()} />, okText: 'Закрыть' }); }
  };

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

  return <div className="services-page" style={{ '--service-surface': token.colorBgContainer, '--service-border': token.colorBorderSecondary, '--service-muted': token.colorTextSecondary, '--service-accent': token.colorPrimary, '--service-tint': token.colorPrimaryBg, '--service-shadow': token.boxShadowSecondary } as CSSProperties}>
    <div className="services-heading">
      <div className="services-heading-title"><span className="services-heading-icon"><AppstoreOutlined /></span><div><span className="services-eyebrow">Рабочее пространство</span><Typography.Title level={2} style={{ margin: 0 }}>Сервисы</Typography.Title><Typography.Text type="secondary">Внутренние ресурсы колледжа в одном месте</Typography.Text></div></div>
      {isAdmin && <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>Добавить сервис</Button>}
    </div>
    <div className="services-toolbar">
      <Input prefix={<SearchOutlined />} placeholder="Найти сервис" aria-label="Поиск сервисов" allowClear value={search} onChange={(event) => setSearch(event.target.value)} />
      {isAdmin && <Segmented aria-label="Какие сервисы показать" value={showHidden ? 'all' : 'active'} onChange={(value) => setShowHidden(value === 'all')} options={[{ value: 'active', label: 'В панели' }, { value: 'all', label: 'Все сервисы' }]} />}
    </div>
    <div className="services-list-heading"><Typography.Text type="secondary">{showHidden ? 'Все сервисы, включая скрытые' : 'Быстрый доступ'} <span className="services-count">{filtered.length}</span></Typography.Text><Typography.Text type="secondary" className="services-network-note">Доступность зависит от сети колледжа</Typography.Text></div>
    {isError ? <Alert type="error" showIcon title="Не удалось загрузить сервисы" action={<Button onClick={() => void refetch()}>Повторить</Button>} /> : <Spin spinning={isLoading}>
      {!isLoading && !filtered.length && <Card><Empty image={<AppstoreOutlined style={{ fontSize: 48 }} />} description={search.trim() ? 'По вашему запросу ничего не найдено' : 'Добавьте первый сервис. Панель доступна только сисадминам.'} /></Card>}
      <div className="services-grid">{filtered.map((service) => <article key={service.id} className={`service-card${service.isActive ? '' : ' service-card--hidden'}`}>
        <a className="service-link" href={service.url} target="_blank" rel="noopener noreferrer">
          <div className="service-card-top"><ServiceIcon service={service} />{!service.isActive && <span className="service-hidden-badge"><EyeInvisibleOutlined /> Скрыт</span>}</div>
          <span className="service-name">{service.name}</span>
          {service.description && <span className="service-description">{service.description}</span>}
          <span className="service-card-footer"><span className="service-host">{host(service.url)}</span><span className="service-open" aria-label="Открыть в новой вкладке"><ExportOutlined /></span></span>
        </a>
        {isAdmin && <Dropdown trigger={['click']} classNames={{ root: 'service-actions-menu' }} menu={{ items: [
          { key: 'edit', icon: <EditOutlined />, label: 'Изменить', onClick: () => openEditor(service) },
          { key: 'copy', icon: <CopyOutlined />, label: 'Скопировать ссылку', onClick: () => { void copyLink(service.url); } },
          { type: 'divider' },
          { key: 'visibility', icon: service.isActive ? <EyeInvisibleOutlined /> : <EyeOutlined />, label: service.isActive ? 'Убрать из панели' : 'Показать в панели', onClick: () => visibility.mutate({ id: service.id, active: !service.isActive }) },
          { key: 'delete', icon: <DeleteOutlined />, label: 'Удалить сервис', danger: true, onClick: () => modal.confirm({ title: `Удалить сервис «${service.name}»?`, content: 'Ссылка исчезнет из панели сервисов.', okText: 'Удалить', cancelText: 'Отмена', okButtonProps: { danger: true }, onOk: () => remove.mutateAsync(service.id) }) },
        ] }}><Button className="service-menu-button" type="text" aria-label={`Управление сервисом ${service.name}`} icon={<MoreOutlined />} loading={(visibility.isPending && visibility.variables?.id === service.id) || (remove.isPending && remove.variables === service.id)} /></Dropdown>}
      </article>)}</div>
    </Spin>}
    <Modal title={editor?.service ? 'Изменить сервис' : 'Добавить сервис'} open={editor !== null} onCancel={() => !save.isPending && !readingFile && setEditor(null)} onOk={() => form.submit()} okText="Сохранить" cancelText="Отмена" confirmLoading={save.isPending} okButtonProps={{ disabled: readingFile }} cancelButtonProps={{ disabled: save.isPending || readingFile }} maskClosable={!save.isPending && !readingFile} closable={!save.isPending && !readingFile}>
      <Form form={form} layout="vertical" onFinish={(values) => { if (savingRef.current) return; if (values.iconType === 'image' && !values.imageData) { message.error('Загрузите картинку перед сохранением'); return; } savingRef.current = true; save.mutate(values); }} disabled={save.isPending || readingFile}>
        <div className="service-editor-section"><span className="service-editor-section-title">Основное</span>
        <Form.Item name="name" label="Название" rules={[{ required: true, whitespace: true, message: 'Введите название' }, { max: 80 }]}><Input maxLength={80} placeholder="Например, Электронная библиотека" /></Form.Item>
        <Form.Item name="url" label="Ссылка" extra="Можно указать локальный адрес: http://192.168.1.10 или https://library.local" rules={[{ required: true, message: 'Введите ссылку' }, { validator: (_, value: string) => { try { const url = new URL(value?.trim()); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(); return Promise.resolve(); } catch { return Promise.reject(new Error('Укажите ссылку с http:// или https:// без логина и пароля')); } } }]}><Input maxLength={2000} placeholder="https://" inputMode="url" autoCapitalize="none" /></Form.Item>
        <Form.Item name="description" label="Краткое описание (необязательно)"><Input.TextArea maxLength={240} showCount autoSize={{ minRows: 2, maxRows: 4 }} /></Form.Item>
        </div><div className="service-editor-section"><span className="service-editor-section-title">Оформление</span>
        <Form.Item name="iconType" label="Значок"><Select options={[{ value: 'emoji', label: 'Эмодзи' }, { value: 'image', label: 'Своя картинка' }]} /></Form.Item>
        <div className="service-icon-editor"><ServiceIcon service={{ iconType, emoji, imageData }} />
          {iconType === 'emoji' ? <div><Form.Item name="emoji" label="Эмодзи" rules={[{ required: true, whitespace: true, message: 'Выберите или вставьте эмодзи' }]} style={{ marginBottom: 8 }}><Input maxLength={32} /></Form.Item><div className="service-emoji-options">{EMOJI.map((value) => <Button key={value} aria-label={`Выбрать ${value}`} onClick={() => form.setFieldValue('emoji', value)}>{value}</Button>)}</div></div>
          : <div><Upload accept="image/png,image/jpeg,image/webp,image/gif" showUploadList={false} beforeUpload={readImage}><Button icon={<UploadOutlined />} loading={readingFile}>Выбрать картинку</Button></Upload><Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>PNG, JPEG, WebP или GIF до 512 КБ.</Typography.Paragraph></div>}
        </div>
        <Form.Item name="imageData" hidden><Input /></Form.Item>
        {iconType === 'image' && !imageData && <Typography.Paragraph type="secondary">Загрузите картинку перед сохранением.</Typography.Paragraph>}
        </div><details className="service-editor-options"><summary>Порядок и видимость</summary>
        <Form.Item name="sortOrder" label="Порядок в панели" extra="Меньшие числа — в начале списка." rules={[{ required: true }]}><InputNumber min={0} max={10000} precision={0} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="isActive" valuePropName="checked" label="Показывать в панели"><Switch /></Form.Item>
        </details>
      </Form>
    </Modal>
  </div>;
}
