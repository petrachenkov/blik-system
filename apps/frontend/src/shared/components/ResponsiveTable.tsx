import { Button, Card, Checkbox, Empty, Grid, Pagination, Space, Spin, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import type { ReactNode } from 'react';
import { useState } from 'react';

/** На телефоне каждая запись — карточка с подписями полей и доступными действиями. */
export function ResponsiveTable<T extends object>(props: TableProps<T>) {
  const mobile = !Grid.useBreakpoint().lg;
  const [localPage, setLocalPage] = useState(1);
  if (!mobile || props.summary) return <div style={{ minWidth: 0, overflowX: 'auto' }}><Table<T> {...props} /></div>;
  const pagination = props.pagination === false ? null : props.pagination ?? {};
  const page = pagination?.current ?? localPage;
  const pageSize = pagination?.pageSize ?? 10;
  const rows = props.dataSource ?? [];
  const shown = pagination && rows.length > pageSize ? rows.slice((page - 1) * pageSize, page * pageSize) : rows;
  const columns = (props.columns ?? []).filter((col) => !col.hidden && !('children' in col));
  return <Spin spinning={typeof props.loading === 'boolean' ? props.loading : Boolean(props.loading?.spinning)}>
    <div className="admin-records">
      {shown.map((record, index) => {
        const key = typeof props.rowKey === 'function' ? props.rowKey(record, index) : (record as Record<string, unknown>)[String(props.rowKey ?? 'key')] as string ?? index;
        const selection = props.rowSelection;
        return <Card size="small" key={key}>
          {selection && <Checkbox {...selection.getCheckboxProps?.(record)} checked={selection.selectedRowKeys?.includes(key)} onChange={(e) => {
            const keys = e.target.checked ? [...(selection.selectedRowKeys ?? []), key] : (selection.selectedRowKeys ?? []).filter((k) => k !== key);
            selection.onChange?.(keys, rows.filter((r, i) => keys.includes(typeof props.rowKey === 'function' ? props.rowKey(r, i) : (r as Record<string, unknown>)[String(props.rowKey ?? 'key')] as string)), { type: 'single' });
          }}>Выбрать запись</Checkbox>}
          <Space orientation="vertical" size={12} style={{ width: '100%' }}>
            {columns.map((col, colIndex) => {
              if ('children' in col) return null;
              const field = col.dataIndex;
              const value = (Array.isArray(field) ? field : field == null ? [] : [field]).reduce<unknown>((obj, part) => obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[String(part)] : undefined, record);
              const content = col.render ? col.render(value, record, index) as ReactNode : value == null ? '—' : String(value);
              return <div className="admin-record-field" key={String(col.key ?? colIndex)}>
                {typeof col.title !== 'function' && col.title && <Typography.Text type="secondary">{col.title}</Typography.Text>}
                <div>{content}</div>
              </div>;
            })}
          </Space>
          {props.onRow?.(record, index)?.onClick && <Button block style={{ marginTop: 12 }} onClick={(event) => props.onRow?.(record, index)?.onClick?.(event as never)}>Открыть подробности</Button>}
        </Card>;
      })}
      {!rows.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нет записей" />}
    </div>
    {pagination && <Pagination {...pagination} simple showSizeChanger={false} current={page} pageSize={pageSize} total={pagination.total ?? rows.length} hideOnSinglePage style={{ justifyContent: 'center', marginTop: 16 }} onChange={(next, size) => { setLocalPage(next); pagination.onChange?.(next, size); }} />}
  </Spin>;
}

ResponsiveTable.Summary = Table.Summary;
