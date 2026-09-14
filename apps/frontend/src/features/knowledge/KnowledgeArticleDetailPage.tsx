import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Descriptions, Empty, Form, Input, List, Modal, Popconfirm, Select, Space, Tag, Typography, Upload, App as AntdApp } from 'antd';
import { DeleteOutlined, EditOutlined, UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  deleteKnowledgeArticle,
  deleteKnowledgeArticleAttachment,
  fetchKnowledgeArticle,
  fetchKnowledgeArticleAttachments,
  updateKnowledgeArticle,
  uploadKnowledgeArticleAttachment,
} from '../../shared/api/knowledge';
import { fetchCategories } from '../../shared/api/catalogs';
import { extractErrorMessage } from '../../shared/api/errors';
import { useAuth } from '../../shared/auth/AuthContext';
import { isStaffRole, STATUS_COLORS, STATUS_LABELS } from '../../shared/labels';
import { AttachmentPreview } from '../../shared/components/AttachmentPreview';

interface ArticleFormValues {
  title: string;
  content: string;
  categoryId?: string;
}

/** Детали статьи + "Примеры заявок" — заявки, к чьим ответам эта статья была прикреплена
 * (см. план). Доступна на чтение всем аутентифицированным — в т.ч. преподавателю, перешедшему
 * по ссылке из ответа на собственную заявку; редактирование и удаление — только сотрудникам. */
export function KnowledgeArticleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const articleId = id!;
  const { user } = useAuth();
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [form] = Form.useForm<ArticleFormValues>();

  const { data: article, isLoading } = useQuery({
    queryKey: ['knowledge-articles', articleId],
    queryFn: () => fetchKnowledgeArticle(articleId),
  });
  const categoriesQuery = useQuery({ queryKey: ['categories', 'all'], queryFn: () => fetchCategories(true), enabled: editOpen });
  const attachmentsQuery = useQuery({
    queryKey: ['knowledge-articles', articleId, 'attachments'],
    queryFn: () => fetchKnowledgeArticleAttachments(articleId),
  });

  const canManage = isStaffRole(user?.role ?? 'USER');
  const canDelete = user?.role === 'ADMIN';

  const invalidateAttachments = () => queryClient.invalidateQueries({ queryKey: ['knowledge-articles', articleId, 'attachments'] });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadKnowledgeArticleAttachment(articleId, file),
    onSuccess: () => void invalidateAttachments(),
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось загрузить файл')),
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: string) => deleteKnowledgeArticleAttachment(articleId, attachmentId),
    onSuccess: () => void invalidateAttachments(),
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось удалить файл')),
  });

  const updateMutation = useMutation({
    mutationFn: (values: ArticleFormValues) => updateKnowledgeArticle(articleId, values),
    onSuccess: () => {
      setEditOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['knowledge-articles'] });
      message.success('Статья обновлена');
    },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось сохранить статью')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteKnowledgeArticle(articleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['knowledge-articles'] });
      message.success('Статья удалена');
      navigate('/knowledge', { replace: true });
    },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось удалить статью')),
  });

  if (isLoading || !article) return <Card loading />;

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Card
        title={article.title}
        extra={
          canManage && (
            <Space>
              <Button
                icon={<EditOutlined />}
                onClick={() => {
                  form.setFieldsValue({ title: article.title, content: article.content, categoryId: article.categoryId ?? undefined });
                  setEditOpen(true);
                }}
              >
                Редактировать
              </Button>
              {canDelete && (
                <Popconfirm title="Удалить статью?" okText="Удалить" okButtonProps={{ danger: true }} cancelText="Отмена" onConfirm={() => deleteMutation.mutate()}>
                  <Button danger icon={<DeleteOutlined />} loading={deleteMutation.isPending}>
                    Удалить
                  </Button>
                </Popconfirm>
              )}
            </Space>
          )
        }
      >
        <Descriptions column={2} size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="Категория">
            {article.category ? <Tag>{article.category.name}</Tag> : <Typography.Text type="secondary">без категории</Typography.Text>}
          </Descriptions.Item>
          <Descriptions.Item label="Использована в ответах">{article._count.usedInComments}</Descriptions.Item>
          <Descriptions.Item label="Автор">{article.createdBy?.fullName ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Обновлена">{dayjs(article.updatedAt).format('DD.MM.YYYY HH:mm')}</Descriptions.Item>
        </Descriptions>
        <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{article.content}</Typography.Paragraph>

        {(attachmentsQuery.data ?? []).length > 0 && (
          <div style={{ marginBottom: canManage ? 16 : 0 }}>
            <Typography.Text strong>Файлы:</Typography.Text>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {(attachmentsQuery.data ?? []).map((a) => (
                <div key={a.id} style={{ position: 'relative' }}>
                  <AttachmentPreview downloadUrl={`/knowledge-articles/${articleId}/attachments/${a.id}`} attachment={a} />
                  {canManage && (
                    <Popconfirm title="Удалить файл?" okText="Удалить" cancelText="Отмена" onConfirm={() => deleteAttachmentMutation.mutate(a.id)}>
                      <Button danger type="text" size="small" icon={<DeleteOutlined />} style={{ position: 'absolute', top: -4, right: -4 }} />
                    </Popconfirm>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {canManage && (
          <Upload
            multiple
            fileList={[]}
            showUploadList={false}
            beforeUpload={(file) => {
              uploadMutation.mutate(file);
              return false;
            }}
          >
            <Button icon={<UploadOutlined />} loading={uploadMutation.isPending}>
              Прикрепить файл
            </Button>
          </Upload>
        )}
      </Card>

      <Card title="Примеры заявок">
        {article.exampleTickets.length === 0 ? (
          <Empty description="Пока не использовалась ни в одном ответе" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <List
            dataSource={article.exampleTickets}
            renderItem={(t) => (
              <List.Item
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/tickets/${t.id}`)}
                actions={[<Tag key="status" color={STATUS_COLORS[t.status]}>{STATUS_LABELS[t.status]}</Tag>]}
              >
                <List.Item.Meta
                  title={`${t.number} · ${t.location.building}, каб. ${t.location.room}`}
                  description={
                    <>
                      <span>{t.description}</span>
                      <br />
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{dayjs(t.createdAt).format('DD.MM.YYYY HH:mm')}</Typography.Text>
                    </>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>

      <Modal
        title="Редактировать статью"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={updateMutation.isPending}
        okText="Сохранить"
        cancelText="Отмена"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(values) => updateMutation.mutate(values)}>
          <Form.Item name="title" label="Название" rules={[{ required: true, min: 3, message: 'Введите название' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="categoryId" label="Категория">
            <Select allowClear placeholder="Без категории" options={(categoriesQuery.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="content" label="Решение" rules={[{ required: true, min: 5, message: 'Опишите решение' }]}>
            <Input.TextArea rows={8} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
