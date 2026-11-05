import { Button, Card, Checkbox, Empty, Grid, Pagination, Select, Space, Spin, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import type { ReactNode } from 'react';
import { Children, isValidElement, useState } from 'react';

/** На телефоне каждая запись — карточка с подписями полей и доступными действиями. */
export function ResponsiveTable<T extends object>(props: TableProps<T>) {
  const mobile = !Grid.useBreakpoint().lg;
  const [localPage, setLocalPage] = useState(1);
  const [sort, setSort] = useState<string>();
  if (!mobile) return <div style={{ minWidth: 0, overflowX: 'auto' }}><Table<T> {...props} /></div>;
  const pagination = props.pagination === false ? null : props.pagination ?? {};
  const pageSize = pagination?.pageSize ?? 10;
  const rows = [...(props.dataSource ?? [])];
  const columns = (props.columns ?? []).filter((col) => !col.hidden && !('children' in col));
  const sortables = columns.flatMap((col, index) => col.sorter && typeof col.title === 'string' ? [{ col, index }] : []);
  if (sort) {
    const [index, direction] = sort.split(':');
    const sorter = columns[Number(index)]?.sorter;
    const compare = typeof sorter === 'function' ? sorter : typeof sorter === 'object' ? sorter.compare : undefined;
    if (compare) rows.sort((a, b) => compare(a, b, direction === 'asc' ? 'ascend' : 'descend') * (direction === 'asc' ? 1 : -1));
  }
  const page = pagination?.current ?? Math.min(localPage, Math.max(1, Math.ceil(rows.length / pageSize)));
  const shown = pagination && rows.length > pageSize ? rows.slice((page - 1) * pageSize, page * pageSize) : rows;
  const totals: { index: number; content: ReactNode }[] = [];
  const collectTotals = (nodes: ReactNode) => Children.forEach(nodes, (node) => {
    if (!isValidElement<{ index?: number; children?: ReactNode }>(node)) return;
    if (node.type === Table.Summary.Cell && typeof node.props.index === 'number') totals.push({ index: node.props.index, content: node.props.children });
    else if (node.props.children) collectTotals(node.props.children);
  });
  if (props.summary) collectTotals(props.summary(rows));
  return <Spin spinning={typeof props.loading === 'boolean' ? props.loading : Boolean(props.loading?.spinning)}>
    {!!sortables.length && <Select aria-label="Сортировка записей" allowClear placeholder="Сортировка" value={sort} onChange={(value) => { setSort(value); setLocalPage(1); }} style={{ width: '100%', marginBottom: 12 }} options={sortables.flatMap(({ col, index }) => [{ value: `${index}:asc`, label: `${col.title}: по возрастанию` }, { value: `${index}:desc`, label: `${col.title}: по убыванию` }])} />}
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
    {!!totals.length && <Card size="small" title="Итоги" style={{ marginTop: 12 }}><div className="admin-records">{totals.map(({ index, content }) => <div key={index} className="admin-record-field"><Typography.Text type="secondary">{typeof columns[index]?.title === 'function' ? '' : columns[index]?.title as ReactNode}</Typography.Text><div>{content}</div></div>)}</div></Card>}
    {pagination && <Pagination {...pagination} simple showSizeChanger={false} current={page} pageSize={pageSize} total={pagination.total ?? rows.length} hideOnSinglePage style={{ justifyContent: 'center', marginTop: 16 }} onChange={(next, size) => { setLocalPage(next); pagination.onChange?.(next, size); }} />}
  </Spin>;
}

ResponsiveTable.Summary = Table.Summary;
