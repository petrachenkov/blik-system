import { useEffect, useMemo, useRef, useState } from 'react';
import { Empty, Input, Modal, Spin, Tag, Typography } from 'antd';
import { FileTextOutlined, ReadOutlined, EnvironmentOutlined, UserOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { globalSearch } from '../../shared/api/search';
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue';
import { STATUS_COLORS, STATUS_LABELS, ROLE_LABELS } from '../../shared/labels';

interface Row {
  key: string;
  group: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  extra?: React.ReactNode;
  to: string;
}

/** Глобальный поиск по Ctrl/Cmd-K (см. план). Монтируется один раз в AppLayout. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const debounced = useDebouncedValue(query.trim(), 250);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onOpenChange]);

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => globalSearch(debounced),
    enabled: open && debounced.length >= 2,
  });

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const out: Row[] = [];
    for (const t of data.tickets) {
      out.push({
        key: `t-${t.id}`,
        group: 'Заявки',
        icon: <FileTextOutlined />,
        title: `${t.number} — ${t.description.slice(0, 80)}`,
        extra: <Tag color={STATUS_COLORS[t.status]}>{STATUS_LABELS[t.status]}</Tag>,
        to: `/tickets/${t.id}`,
      });
    }
    for (const a of data.articles) {
      out.push({ key: `a-${a.id}`, group: 'База знаний', icon: <ReadOutlined />, title: a.title, to: `/knowledge/${a.id}` });
    }
    for (const u of data.users) {
      out.push({
        key: `u-${u.id}`,
        group: 'Сотрудники',
        icon: <UserOutlined />,
        title: u.fullName,
        subtitle: ROLE_LABELS[u.role],
        to: `/tickets?assigneeId=${u.id}`,
      });
    }
    for (const l of data.locations) {
      out.push({
        key: `l-${l.id}`,
        group: 'Кабинеты',
        icon: <EnvironmentOutlined />,
        title: `${l.building}, каб. ${l.room}${l.label ? ` (${l.label})` : ''}`,
        to: `/tickets?locationId=${l.id}`,
      });
    }
    return out;
  }, [data]);

  // Активная строка не может выходить за пределы текущего списка результатов.
  const activeIdx = rows.length === 0 ? 0 : Math.min(active, rows.length - 1);

  const close = () => {
    onOpenChange(false);
    setQuery('');
    setActive(0);
  };

  const go = (row: Row) => {
    close();
    navigate(row.to);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && rows[activeIdx]) {
      e.preventDefault();
      go(rows[activeIdx]);
    }
  };

  let lastGroup = '';

  return (
    <Modal
      open={open}
      onCancel={close}
      footer={null}
      closable={false}
      destroyOnHidden
      styles={{ body: { padding: 0 } }}
      style={{ top: 80 }}
      width={640}
    >
      <Input
        size="large"
        autoFocus
        variant="borderless"
        prefix={<SearchOutlined style={{ color: '#999' }} />}
        placeholder="Поиск заявок, статей, сотрудников, кабинетов…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onInputKey}
        style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', borderRadius: 0 }}
      />
      <div ref={listRef} style={{ maxHeight: 420, overflowY: 'auto', padding: '4px 0' }}>
        {isFetching && (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <Spin size="small" />
          </div>
        )}
        {!isFetching && debounced.length >= 2 && rows.length === 0 && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Ничего не найдено" style={{ padding: 24 }} />
        )}
        {rows.map((row, i) => {
          const header = row.group !== lastGroup ? row.group : null;
          lastGroup = row.group;
          return (
            <div key={row.key}>
              {header && (
                <div style={{ padding: '8px 16px 2px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#999' }}>
                  {header}
                </div>
              )}
              <div
                onMouseEnter={() => setActive(i)}
                onClick={() => go(row)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 16px',
                  cursor: 'pointer',
                  background: i === activeIdx ? 'rgba(22,119,255,0.08)' : undefined,
                }}
              >
                <span style={{ color: '#888' }}>{row.icon}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.title}
                  {row.subtitle && (
                    <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                      {row.subtitle}
                    </Typography.Text>
                  )}
                </span>
                {row.extra}
              </div>
            </div>
          );
        })}
        {debounced.length < 2 && (
          <div style={{ padding: 20, color: '#999', fontSize: 13 }}>Введите минимум 2 символа</div>
        )}
      </div>
    </Modal>
  );
}
