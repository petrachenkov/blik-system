import { ResponsiveTable as Table } from '../../shared/components/ResponsiveTable';
import { useState } from 'react';
import { Button, Card, Form, Input, Popconfirm, Segmented, Switch, Tooltip, Typography, App as AntdApp } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createTextSnippet, deleteTextSnippet, fetchTextSnippets, reorderTextSnippets, updateTextSnippet } from '../../shared/api/textSnippets';
import { extractErrorMessage } from '../../shared/api/errors';
import type { SnippetKind, TextSnippet } from '../../shared/types';

const KIND_OPTIONS: { label: string; value: SnippetKind }[] = [
  { label: 'Шаблоны заявок', value: 'TICKET_TEMPLATE' },
  { label: 'Шаблоны быстрых ответов', value: 'CANNED_RESPONSE' },
];

/**
 * Управление каталогом переиспользуемых текстов (см. план "Шаблоны заявок" / "Шаблоны быстрых
 * ответов сисадмина") — одна и та же модель TextSnippet, разделённая полем kind. Именно эта
 * страница — единственное место, где шаблоны можно добавить: без неё их неоткуда взять.
 */
export function TextSnippetsPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<SnippetKind>('TICKET_TEMPLATE');
  const [form] = Form.useForm<{ title: string; body: string }>();

  const { data = [], isLoading } = useQuery({
    queryKey: ['text-snippets', kind, 'all'],
    queryFn: () => fetchTextSnippets(kind, true),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['text-snippets'] });

  const createMutation = useMutation({
    mutationFn: (values: { title: string; body: string }) => createTextSnippet({ kind, ...values }),
    onSuccess: () => { form.resetFields(); void invalidate(); message.success('Шаблон добавлен'); },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось добавить шаблон')),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateTextSnippet(id, { isActive }),
    onSuccess: () => void invalidate(),
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось изменить доступность шаблона')),
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => reorderTextSnippets(kind, ids),
    onSettled: invalidate,
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось изменить порядок шаблонов')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTextSnippet(id),
    onSuccess: () => { void invalidate(); message.success('Шаблон удалён'); },
    onError: (error) => message.error(extractErrorMessage(error, 'Не удалось удалить шаблон')),
  });

  const move = (record: TextSnippet, direction: -1 | 1) => {
    const index = data.findIndex((s) => s.id === record.id);
    const neighbor = data[index + direction];
    if (!neighbor) return;
    const ids = data.map((snippet) => snippet.id);
    ids[index] = neighbor.id;
    ids[index + direction] = record.id;
    reorderMutation.mutate(ids);
  };

  return (
    <Card title="Шаблоны текста">
      <Segmented className="snippet-kind" options={KIND_OPTIONS} value={kind} onChange={(v) => setKind(v as SnippetKind)} style={{ marginBottom: 16 }} />

      <Form form={form} layout="inline" onFinish={(values) => createMutation.mutate(values)} style={{ marginBottom: 16, flexWrap: 'wrap', rowGap: 8 }}>
        <Form.Item name="title" rules={[{ required: true, min: 2, message: 'Введите заголовок' }]}>
          <Input placeholder="Заголовок" style={{ width: 220 }} />
        </Form.Item>
        <Form.Item name="body" rules={[{ required: true, min: 2, message: 'Введите текст' }]} style={{ flex: 1, minWidth: 280 }}>
          <Input.TextArea placeholder="Текст шаблона" autoSize={{ minRows: 1, maxRows: 4 }} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={createMutation.isPending}>Добавить</Button>
        </Form.Item>
      </Form>

      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        pagination={false}
        scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Заголовок', dataIndex: 'title', width: 220 },
          {
            title: 'Текст',
            dataIndex: 'body',
            render: (body: string) => (
              <Tooltip title={body}>
                <Typography.Text className="snippet-preview" ellipsis style={{ maxWidth: 360, display: 'inline-block' }}>{body}</Typography.Text>
              </Tooltip>
            ),
          },
          {
            title: 'Активен',
            width: 90,
            render: (_, record) => (
              <Switch checked={record.isActive} onChange={(isActive) => toggleMutation.mutate({ id: record.id, isActive })} />
            ),
          },
          {
            title: 'Порядок',
            width: 90,
            render: (_, record, index) => (
              <>
                <Button aria-label="Выше" type="text" size="small" icon={<ArrowUpOutlined />} disabled={reorderMutation.isPending || index === 0} onClick={() => move(record, -1)} />
                <Button aria-label="Ниже" type="text" size="small" icon={<ArrowDownOutlined />} disabled={reorderMutation.isPending || index === data.length - 1} onClick={() => move(record, 1)} />
              </>
            ),
          },
          {
            title: '',
            width: 60,
            render: (_, record) => (
              <Popconfirm title="Удалить шаблон?" onConfirm={() => deleteMutation.mutate(record.id)} okText="Удалить" cancelText="Отмена">
                <Button danger type="text" icon={<DeleteOutlined />} loading={deleteMutation.isPending} />
              </Popconfirm>
            ),
          },
        ]}
      />
    </Card>
  );
}
