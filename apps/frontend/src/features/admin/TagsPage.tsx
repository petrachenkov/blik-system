import { Button, Card, Drawer, Form, Input, Popconfirm, Select, Space, Switch, Table, Tag, Typography, App as AntdApp } from 'antd';
import { DeleteOutlined, PlusOutlined, TagsOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  addTagRule,
  createTag,
  deleteTag,
  deleteTagRule,
  fetchTags,
  updateTag,
  type Tag as TagModel,
} from '../../shared/api/tags';
import { extractErrorMessage } from '../../shared/api/errors';

const COLOR_OPTIONS = ['blue', 'cyan', 'green', 'gold', 'orange', 'red', 'volcano', 'purple', 'magenta', 'lime', 'geekblue'];

export function TagsPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{ name: string; color?: string }>();
  const [editingTagId, setEditingTagId] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({ queryKey: ['tags', 'all'], queryFn: () => fetchTags(true) });
  const editingTag = data.find((t) => t.id === editingTagId) ?? null;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tags'] });

  const createMutation = useMutation({
    mutationFn: (values: { name: string; color?: string }) => createTag(values),
    onSuccess: () => { form.resetFields(); void invalidate(); message.success('Тег добавлен'); },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось добавить тег')),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateTag(id, { isActive }),
    onSuccess: () => void invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTag(id),
    onSuccess: () => { void invalidate(); message.success('Тег удалён'); },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось удалить тег')),
  });

  const addRuleMutation = useMutation({
    mutationFn: ({ tagId, keyword }: { tagId: string; keyword: string }) => addTagRule(tagId, keyword),
    onSuccess: () => void invalidate(),
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось добавить ключевое слово')),
  });

  const removeRuleMutation = useMutation({
    mutationFn: ({ tagId, ruleId }: { tagId: string; ruleId: string }) => deleteTagRule(tagId, ruleId),
    onSuccess: () => void invalidate(),
  });

  return (
    <Card title="Теги заявок">
      <Typography.Paragraph type="secondary">
        Тег автоматически проставляется новой заявке, если её описание содержит одно из ключевых слов тега (без учёта регистра).
        Ключевые слова редактируются кнопкой «Правила» — задавайте точные фразы и словоформы («wi-fi», «вайфай», «вай фай»).
      </Typography.Paragraph>

      <Form form={form} layout="inline" onFinish={(values) => createMutation.mutate(values)} style={{ marginBottom: 16 }}>
        <Form.Item name="name" rules={[{ required: true, min: 2, message: 'Введите название' }]}>
          <Input placeholder="Например, Сеть" style={{ width: 200 }} />
        </Form.Item>
        <Form.Item name="color">
          <Select
            allowClear
            placeholder="Цвет"
            style={{ width: 140 }}
            options={COLOR_OPTIONS.map((c) => ({ value: c, label: <Tag color={c}>{c}</Tag> }))}
          />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={createMutation.isPending}>Добавить</Button>
        </Form.Item>
      </Form>

      <Table<TagModel>
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Тег', render: (_, r) => <Tag color={r.color ?? undefined} icon={<TagsOutlined />}>{r.name}</Tag> },
          { title: 'Ключевых слов', dataIndex: ['rules'], render: (rules: TagModel['rules']) => rules.length },
          { title: 'В заявках', render: (_, r) => r._count.tickets },
          {
            title: 'Активен',
            render: (_, r) => (
              <Switch checked={r.isActive} onChange={(isActive) => toggleMutation.mutate({ id: r.id, isActive })} />
            ),
          },
          {
            title: '',
            width: 180,
            render: (_, r) => (
              <Space>
                <Button size="small" onClick={() => setEditingTagId(r.id)}>Правила</Button>
                <Popconfirm
                  title="Удалить тег?"
                  description="Если он уже проставлен в заявках, удаление будет отклонено — деактивируйте его."
                  onConfirm={() => deleteMutation.mutate(r.id)}
                  okText="Удалить"
                  cancelText="Отмена"
                >
                  <Button danger type="text" icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Drawer
        title={editingTag ? `Ключевые слова тега «${editingTag.name}»` : ''}
        open={Boolean(editingTag)}
        onClose={() => setEditingTagId(null)}
        width={420}
      >
        {editingTag && (
          <Space direction="vertical" size="middle" style={{ display: 'flex' }}>
            <Space wrap size="middle">
              {editingTag.rules.length === 0 && <Typography.Text type="secondary">Пока нет ни одного слова</Typography.Text>}
              {editingTag.rules.map((rule) => (
                <Tag
                  key={rule.id}
                  closable
                  onClose={(e) => {
                    e.preventDefault();
                    removeRuleMutation.mutate({ tagId: editingTag.id, ruleId: rule.id });
                  }}
                >
                  {rule.keyword}
                </Tag>
              ))}
            </Space>
            <Input.Search
              placeholder="Новое ключевое слово"
              enterButton="Добавить"
              onSearch={(value) => {
                const keyword = value.trim();
                if (keyword.length >= 2) addRuleMutation.mutate({ tagId: editingTag.id, keyword });
              }}
            />
          </Space>
        )}
      </Drawer>
    </Card>
  );
}
