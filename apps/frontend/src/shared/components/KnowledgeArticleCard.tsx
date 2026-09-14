import { Link } from 'react-router-dom';
import { theme, Typography } from 'antd';
import { ReadOutlined, RightOutlined } from '@ant-design/icons';

/**
 * Заметная карточка статьи БЗ — вместо мелкой ссылки-иконки (см. фидбэк: подсказки статей
 * на форме заявки и прикреплённые статьи в чате должны "бросаться в глаза", а не теряться
 * в тексте). Используется и в подсказках CreateTicketPage, и в чате TicketDetailPage —
 * один компонент, чтобы приём заметности был одинаковым в обоих местах.
 */
export function KnowledgeArticleCard({
  article,
  size = 'default',
}: {
  article: { id: string; title: string };
  size?: 'default' | 'small';
}) {
  const { token } = theme.useToken();
  const compact = size === 'small';

  return (
    <Link
      to={`/knowledge/${article.id}`}
      target="_blank"
      rel="noreferrer"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 8 : 10,
        padding: compact ? '6px 10px' : '10px 14px',
        borderRadius: token.borderRadiusLG,
        background: token.colorInfoBg,
        border: `1px solid ${token.colorInfoBorder}`,
        color: token.colorText,
        textDecoration: 'none',
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: compact ? 24 : 30,
          height: compact ? 24 : 30,
          borderRadius: '50%',
          background: token.colorInfo,
          color: token.colorWhite ?? '#fff',
          flexShrink: 0,
          fontSize: compact ? 12 : 14,
        }}
      >
        <ReadOutlined />
      </span>
      <Typography.Text strong style={{ flex: 1, fontSize: compact ? 13 : 14 }}>
        {article.title}
      </Typography.Text>
      <RightOutlined style={{ fontSize: 11, color: token.colorInfo, flexShrink: 0 }} />
    </Link>
  );
}
