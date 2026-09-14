import { Dropdown, Button } from 'antd';
import { DesktopOutlined, BulbOutlined, BulbFilled, CheckOutlined } from '@ant-design/icons';
import { useThemeMode, type ThemeMode } from './ThemeContext';

const OPTIONS: { key: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { key: 'system', label: 'Как в системе', icon: <DesktopOutlined /> },
  { key: 'light', label: 'Светлая', icon: <BulbOutlined /> },
  { key: 'dark', label: 'Тёмная', icon: <BulbFilled /> },
];

/** Переключатель темы — светлая/тёмная/как в системе (см. фидбэк пользователя). */
export function ThemeToggle() {
  const { mode, effective, setMode } = useThemeMode();

  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: OPTIONS.map((o) => ({
          key: o.key,
          icon: o.icon,
          label: o.label,
          extra: mode === o.key ? <CheckOutlined /> : null,
        })),
        onClick: ({ key }) => setMode(key as ThemeMode),
      }}
    >
      <Button type="text" icon={effective === 'dark' ? <BulbFilled /> : <BulbOutlined />} />
    </Dropdown>
  );
}
