import { Button, Card, Form, Input, Modal, Select, Space, Tag, Typography, Upload, App as AntdApp } from 'antd';
import { FileTextOutlined, UploadOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useRef, useState } from 'react';
import { fetchLocations } from '../../shared/api/catalogs';
import { createTicket, uploadTicketAttachment } from '../../shared/api/tickets';
import { fetchKnowledgeSuggestions } from '../../shared/api/knowledge';
import { fetchTextSnippets } from '../../shared/api/textSnippets';
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue';
import { useFeatureFlag } from '../../shared/flags/FeatureFlagsContext';
import { KnowledgeArticleCard } from '../../shared/components/KnowledgeArticleCard';

interface FormValues {
  locationId: string;
  description: string;
}

export function CreateTicketPage() {
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  const [submitting, setSubmitting] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  // Синхронный флаг, а не только React state: между кликом и перерисовкой кнопки в состояние
  // disabled есть окно в несколько миллисекунд, за которое повторный клик/Enter успевает
  // проскочить и создать вторую заявку. Ref обновляется мгновенно, до любого ре-рендера.
  const isSubmittingRef = useRef(false);
  const [form] = Form.useForm<FormValues>();
  const description = Form.useWatch('description', form);
  const debouncedDescription = useDebouncedValue(description, 500);
  const kbSuggestionsEnabled = useFeatureFlag('kb_suggestions');

  const { data: locations = [] } = useQuery({ queryKey: ['locations'], queryFn: () => fetchLocations() });
  // Мягкая подсказка, не блокирует отправку формы (см. план "Авто-подсказка статьи БЗ") —
  // с 8 символов, чтобы не дёргать бэкенд на каждую букву короткого черновика.
  const suggestionsQuery = useQuery({
    queryKey: ['knowledge-articles', 'suggest', debouncedDescription],
    queryFn: () => fetchKnowledgeSuggestions(debouncedDescription),
    enabled: kbSuggestionsEnabled && (debouncedDescription?.length ?? 0) >= 8,
  });
  // Шаблоны типовых заявок (см. план) — управляются Главным сисадмином на /admin/text-snippets.
  const templatesQuery = useQuery({
    queryKey: ['text-snippets', 'TICKET_TEMPLATE'],
    queryFn: () => fetchTextSnippets('TICKET_TEMPLATE'),
  });

  const applyTemplate = (body: string) => {
    const current = (form.getFieldValue('description') as string | undefined)?.trim();
    if (!current) {
      form.setFieldValue('description', body);
      return;
    }
    Modal.confirm({
      title: 'Заменить текущий текст шаблоном?',
      content: 'В поле описания уже что-то введено — оно будет заменено текстом шаблона.',
      okText: 'Заменить',
      cancelText: 'Отмена',
      onOk: () => form.setFieldValue('description', body),
    });
  };

  const onFinish = async (values: FormValues) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSubmitting(true);

    try {
      const ticket = await createTicket(values);

      for (const file of fileList) {
        if (file.originFileObj) {
          await uploadTicketAttachment(ticket.id, file.originFileObj as File);
        }
      }

      message.success(`Заявка ${ticket.number} создана`);
      navigate(`/tickets/${ticket.id}`, { replace: true });
    } catch {
      message.error('Не удалось создать заявку');
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Card title="Новая заявка" style={{ maxWidth: 600 }}>
      <Typography.Paragraph type="secondary">
        Укажите, где произошла проблема, и опишите её — категорию и приоритет проставит исполнитель после того, как возьмёт заявку в работу.
      </Typography.Paragraph>
      <Form<FormValues> form={form} layout="vertical" onFinish={onFinish} disabled={submitting}>
        <Form.Item name="locationId" label="Кабинет / помещение" rules={[{ required: true, message: 'Выберите помещение' }]}>
          <Select
            showSearch
            placeholder="Выберите кабинет, где произошла проблема"
            optionFilterProp="label"
            options={locations.map((l) => ({ value: l.id, label: `${l.building}, каб. ${l.room}${l.label ? ` — ${l.label}` : ''}` }))}
          />
        </Form.Item>
        {(templatesQuery.data?.length ?? 0) > 0 && (
          <div style={{ marginBottom: 12 }}>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>Быстрый шаблон:</Typography.Text>
            <div style={{ marginTop: 6 }}>
              <Space wrap size={[8, 8]}>
                {(templatesQuery.data ?? []).map((t) => (
                  <Tag
                    key={t.id}
                    icon={<FileTextOutlined />}
                    style={{ cursor: 'pointer', paddingBlock: 4, fontSize: 13 }}
                    onClick={() => applyTemplate(t.body)}
                  >
                    {t.title}
                  </Tag>
                ))}
              </Space>
            </div>
          </div>
        )}

        <Form.Item name="description" label="Описание проблемы" rules={[{ required: true, min: 5, message: 'Опишите проблему подробнее' }]}>
          <Input.TextArea rows={5} placeholder="Что произошло? Опишите как можно подробнее" />
        </Form.Item>

        {(suggestionsQuery.data?.length ?? 0) > 0 && (
          <div style={{ marginTop: -12, marginBottom: 16 }}>
            <Typography.Text strong style={{ fontSize: 14 }}>💡 Похоже, есть готовое решение:</Typography.Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {(suggestionsQuery.data ?? []).map((a) => (
                <KnowledgeArticleCard key={a.id} article={a} />
              ))}
            </div>
          </div>
        )}

        <Form.Item label="Фото / видео / файлы (необязательно)">
          <Upload
            multiple
            fileList={fileList}
            beforeUpload={() => false}
            onChange={({ fileList: fl }) => setFileList(fl)}
            listType="picture"
          >
            <Button icon={<UploadOutlined />}>Прикрепить файлы</Button>
          </Upload>
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={submitting} disabled={submitting}>
            Отправить заявку
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}
