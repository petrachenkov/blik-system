import { useState } from 'react';
import { Button, Card, Form, Input, Modal, Select, Space, Table, Tag, Typography, App as AntdApp } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { createKnowledgeArticle, fetchKnowledgeArticles } from '../../shared/api/knowledge';
import { fetchCategories } from '../../shared/api/catalogs';
import { extractErrorMessage } from '../../shared/api/errors';
import type { KnowledgeArticle } from '../../shared/types';

interface ArticleFormValues {
  title: string;
  content: string;
  categoryId?: string;
}

/** База знаний — статьи с готовыми решениями, которые сотрудник техподдержки прикрепляет
 * прямо к ответу на заявку (см. план). "Использована в ответах" — сколько раз статья реально
 * пригодилась, а не просто число просмотров. */
export function KnowledgeBasePage() {
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<ArticleFormValues>();

  const { data = [], isLoading } = useQuery({
    queryKey: ['knowledge-articles', { search, categoryId }],
    queryFn: () => fetchKnowledgeArticles({ search: search || undefined, categoryId }),
  });
  const categoriesQuery = useQuery({ queryKey: ['categories', 'all'], queryFn: () => fetchCategories(true) });

  const createMutation = useMutation({
    mutationFn: (values: ArticleFormValues) => createKnowledgeArticle(values),
    onSuccess: (article) => {
      setModalOpen(false);
      form.resetFields();
      void queryClient.invalidateQueries({ queryKey: ['knowledge-articles'] });
      message.success('Статья добавлена');
      navigate(`/knowledge/${article.id}`);
    },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось создать статью')),
  });

  return (
    <Card
      title="База знаний"
      extra={
        <Space>
          <Input.Search placeholder="Поиск по названию и тексту" allowClear style={{ width: 260 }} onSearch={setSearch} />
          <Select
            allowClear
            placeholder="Категория"
            style={{ width: 180 }}
            value={categoryId}
            onChange={setCategoryId}
            options={(categoriesQuery.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Создать статью
          </Button>
        </Space>
      }
    >
      <Table<KnowledgeArticle>
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        onRow={(record) => ({ onClick: () => navigate(`/knowledge/${record.id}`), style: { cursor: 'pointer' } })}
        columns={[
          { title: 'Название', dataIndex: 'title' },
          {
            title: 'Категория',
            render: (_, a) => (a.category ? <Tag>{a.category.name}</Tag> : <Typography.Text type="secondary">без категории</Typography.Text>),
          },
          {
            title: 'Использована в ответах',
            dataIndex: ['_count', 'usedInComments'],
            sorter: (a, b) => a._count.usedInComments - b._count.usedInComments,
          },
          { title: 'Автор', render: (_, a) => a.createdBy?.fullName ?? '—' },
          { title: 'Обновлена', dataIndex: 'updatedAt', render: (v: string) => dayjs(v).format('DD.MM.YYYY HH:mm') },
        ]}
      />

      <Modal
        title="Новая статья базы знаний"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
        okText="Создать"
        cancelText="Отмена"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(values) => createMutation.mutate(values)}>
          <Form.Item name="title" label="Название" rules={[{ required: true, min: 3, message: 'Введите название' }]}>
            <Input placeholder="Например, Не включается проектор" />
          </Form.Item>
          <Form.Item name="categoryId" label="Категория">
            <Select
              allowClear
              placeholder="Без категории"
              options={(categoriesQuery.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
          </Form.Item>
          <Form.Item name="content" label="Решение" rules={[{ required: true, min: 5, message: 'Опишите решение' }]}>
            <Input.TextArea rows={8} placeholder="Пошаговое решение проблемы..." />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
