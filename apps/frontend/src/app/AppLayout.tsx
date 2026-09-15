import { Alert, Button, Layout, Menu, Space, Tour, Typography, Avatar, Dropdown, theme } from 'antd';
import type { TourProps } from 'antd';
import {
  UserOutlined,
  UnorderedListOutlined,
  PlusOutlined,
  TeamOutlined,
  TagsOutlined,
  EnvironmentOutlined,
  ClockCircleOutlined,
  LogoutOutlined,
  PrinterOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  InboxOutlined,
  CalendarOutlined,
  NotificationOutlined,
  SoundOutlined,
  BarChartOutlined,
  ReadOutlined,
  SafetyOutlined,
  QuestionCircleOutlined,
  HeartOutlined,
  BugOutlined,
  ControlOutlined,
  DesktopOutlined,
  CarryOutOutlined,
  HomeOutlined,
  SearchOutlined,
  BellOutlined,
  MessageOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useAuth } from '../shared/auth/AuthContext';
import { ROLE_COLORS, ROLE_LABELS, isStaffRole } from '../shared/labels';
import { NotificationBell } from '../features/notifications/NotificationBell';
import { CommandPalette } from '../features/search/CommandPalette';
import { ThemeToggle } from '../shared/theme/ThemeToggle';
import { useNotificationsSocket } from '../shared/hooks/useNotificationsSocket';
import { useFeatureFlag } from '../shared/flags/FeatureFlagsContext';
import { fetchActiveAnnouncement } from '../shared/api/announcements';
import { fetchMaintenance } from '../shared/api/system';
import { completeOnboarding } from '../shared/api/auth';

const { Header, Sider, Content } = Layout;
const SIDER_BG = '#0f1a2e';

export function AppLayout() {
  const { user, logout, refetchMe } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();

  useNotificationsSocket(Boolean(user));

  // Общесайтовый баннер — виден сразу после входа на всех страницах, пока Главный сисадмин
  // сам его не уберёт (см. план). В отличие от точечных уведомлений, не имеет "прочитано".
  const { data: announcement } = useQuery({
    queryKey: ['announcement'],
    queryFn: fetchActiveAnnouncement,
    enabled: Boolean(user),
    refetchInterval: 60_000,
  });

  const { data: maintenance } = useQuery({
    queryKey: ['system', 'maintenance'],
    queryFn: fetchMaintenance,
    enabled: Boolean(user),
    refetchInterval: 60_000,
  });

  const onboardingTourEnabled = useFeatureFlag('onboarding_tour');
  const wallboardEnabled = useFeatureFlag('wallboard');
  const visitsEnabled = useFeatureFlag('visits');

  // Онбординг-тур при первом входе (см. план) — ProtectedRoute гарантирует, что AppLayout
  // монтируется уже после того, как user загружен, поэтому ленивый инициализатор безопасен
  // (не нужен отдельный эффект с синхронным setState при загрузке).
  const [tourOpen, setTourOpen] = useState(() => Boolean(user && !user.onboardingCompletedAt && onboardingTourEnabled));
  const [paletteOpen, setPaletteOpen] = useState(false);
  const siderRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLSpanElement>(null);
  const themeRef = useRef<HTMLSpanElement>(null);

  const completeOnboardingMutation = useMutation({
    mutationFn: completeOnboarding,
    onSuccess: () => void refetchMe(),
  });

  const closeTour = () => {
    setTourOpen(false);
    if (user && !user.onboardingCompletedAt) completeOnboardingMutation.mutate();
  };

  if (!user) return null;

  const tourSteps: TourProps['steps'] = [
    {
      title: 'Добро пожаловать в Blik',
      description: isStaffRole(user.role)
        ? 'Слева — список заявок, создание новой, картриджи, база знаний' +
          (user.role === 'ADMIN' ? ' и разделы администрирования.' : '.')
        : 'Слева — список ваших заявок, создание новой заявки и картриджи.',
      target: () => siderRef.current as HTMLElement,
    },
    {
      title: 'Уведомления',
      description: 'Здесь уведомления о ваших заявках — можно также включить push-уведомления браузера.',
      target: () => bellRef.current as HTMLElement,
    },
    {
      title: 'Тема оформления',
      description: 'Переключение между светлой и тёмной темой.',
      target: () => themeRef.current as HTMLElement,
    },
  ];

  // Пункты сисадмина разбиты на именованные группы (см. фидбэк — плоский список
  // из 7+ пунктов было тяжело сканировать глазами в поисках нужного раздела).
  const menuItems = [
    ...(isStaffRole(user.role)
      ? [{ key: '/dashboard', icon: <HomeOutlined />, label: 'Главная' }]
      : []),
    { key: '/tickets', icon: <UnorderedListOutlined />, label: 'Заявки' },
    ...(isStaffRole(user.role) && visitsEnabled
      ? [{ key: '/calendar', icon: <CalendarOutlined />, label: 'Календарь' }]
      : []),
    { key: '/tickets/new', icon: <PlusOutlined />, label: 'Новая заявка' },
    { key: '/cartridges', icon: <PrinterOutlined />, label: 'Картриджи' },
    // База знаний — все, кто реально решает заявки (сисадмин + практикант).
    ...(isStaffRole(user.role)
      ? [{ key: '/knowledge', icon: <ReadOutlined />, label: 'База знаний' }]
      : []),
    ...(user.role === 'ADMIN'
      ? [
          {
            key: 'group-directory',
            type: 'group' as const,
            label: 'Пользователи и справочники',
            children: [
              { key: '/admin/users', icon: <TeamOutlined />, label: 'Пользователи' },
              { key: '/admin/categories', icon: <TagsOutlined />, label: 'Категории' },
              { key: '/admin/tags', icon: <TagsOutlined />, label: 'Теги' },
              { key: '/admin/locations', icon: <EnvironmentOutlined />, label: 'Локации' },
              { key: '/admin/sla', icon: <ClockCircleOutlined />, label: 'SLA' },
              { key: '/admin/text-snippets', icon: <FileTextOutlined />, label: 'Шаблоны текста' },
              { key: '/admin/ticket-archive', icon: <InboxOutlined />, label: 'Архив заявок' },
            ],
          },
          {
            key: 'group-cartridges',
            type: 'group' as const,
            label: 'Картриджи',
            children: [
              { key: '/admin/cartridge-reports', icon: <FileExcelOutlined />, label: 'Отчёты' },
              { key: '/admin/cartridge-archive', icon: <InboxOutlined />, label: 'Архив заправленных' },
              { key: '/admin/refill-events', icon: <CalendarOutlined />, label: 'Плановые заправки' },
            ],
          },
          {
            key: 'group-notifications',
            type: 'group' as const,
            label: 'Уведомления',
            children: [
              { key: '/admin/broadcast', icon: <NotificationOutlined />, label: 'Рассылка' },
              { key: '/admin/announcement', icon: <SoundOutlined />, label: 'Объявление' },
              { key: '/admin/quiet-hours', icon: <ClockCircleOutlined />, label: 'Тихие часы' },
              ...(visitsEnabled
                ? [{ key: '/admin/working-hours', icon: <CarryOutOutlined />, label: 'Рабочие часы визитов' }]
                : []),
            ],
          },
          {
            key: 'group-analytics',
            type: 'group' as const,
            label: 'Аналитика',
            children: [{ key: '/admin/assignee-stats', icon: <BarChartOutlined />, label: 'Статистика исполнителей' }],
          },
          {
            key: 'group-security',
            type: 'group' as const,
            label: 'Безопасность',
            children: [{ key: '/admin/login-log', icon: <SafetyOutlined />, label: 'Журнал входов' }],
          },
          {
            key: 'group-system',
            type: 'group' as const,
            label: 'Система',
            children: [
              { key: '/admin/system-health', icon: <HeartOutlined />, label: 'Здоровье системы' },
              { key: '/admin/error-log', icon: <BugOutlined />, label: 'Журнал ошибок' },
              { key: '/admin/feature-flags', icon: <ControlOutlined />, label: 'Флаги функциональности' },
              ...(wallboardEnabled
                ? [{ key: '/admin/wallboard', icon: <DesktopOutlined />, label: 'Настенная панель' }]
                : []),
            ],
          },
        ]
      : []),
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider ref={siderRef} breakpoint="lg" collapsedWidth="0" style={{ background: SIDER_BG }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff', fontSize: 20, fontWeight: 700, padding: '16px 20px' }}>
          <img src="/logo-blue.png" alt="" style={{ width: 32, height: 32, borderRadius: '50%', background: '#fff' }} />
          Blik
        </div>
        <Menu
          theme="dark"
          mode="inline"
          style={{ background: SIDER_BG }}
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: token.colorBgContainer,
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 8,
            padding: '0 24px',
            height: 64,
            lineHeight: 'normal',
            boxShadow: `0 1px 4px ${token.colorBorderSecondary}`,
            zIndex: 1,
          }}
        >
          <Button
            type="text"
            icon={<SearchOutlined />}
            onClick={() => setPaletteOpen(true)}
            title="Поиск (Ctrl/Cmd + K)"
            style={{ color: token.colorTextSecondary }}
          >
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>⌘K</Typography.Text>
          </Button>
          <Button type="text" shape="circle" icon={<QuestionCircleOutlined />} title="Показать обзор снова" onClick={() => setTourOpen(true)} />
          <span ref={themeRef} style={{ display: 'inline-flex' }}>
            <ThemeToggle />
          </span>
          <span ref={bellRef} style={{ display: 'inline-flex' }}>
            <NotificationBell />
          </span>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'notif-settings',
                  icon: <BellOutlined />,
                  label: 'Настройки уведомлений',
                  onClick: () => navigate('/settings/notifications'),
                },
                {
                  key: 'max-settings',
                  icon: <MessageOutlined />,
                  label: 'MAX',
                  onClick: () => navigate('/settings/max'),
                },
                { type: 'divider' },
                { key: 'logout', icon: <LogoutOutlined />, label: 'Выйти', onClick: () => { void logout().then(() => navigate('/login')); } },
              ],
            }}
          >
            <Space style={{ cursor: 'pointer', marginInlineStart: 4 }}>
              <Avatar style={{ backgroundColor: ROLE_COLORS[user.role] }} icon={<UserOutlined />} />
              <Typography.Text>
                {user.fullName} <Typography.Text type="secondary">· {ROLE_LABELS[user.role]}</Typography.Text>
              </Typography.Text>
            </Space>
          </Dropdown>
        </Header>
        {/* Небольшой отступ, а не 0, сохранён намеренно: у карточек внутри страниц есть Row
            с gutter (отрицательные поля grid-системы) — без этого запаса появляется
            горизонтальный скролл на всю ширину экрана. */}
        <Content style={{ padding: 16 }}>
          {maintenance?.enabled && (
            <Alert
              type="error"
              showIcon
              banner
              title={maintenance.message || 'Идут технические работы. Вход для не-администраторов временно закрыт.'}
              style={{ marginBottom: 16, borderRadius: token.borderRadius }}
            />
          )}
          {announcement?.text && (
            <Alert type="warning" showIcon banner title={announcement.text} style={{ marginBottom: 16, borderRadius: token.borderRadius }} />
          )}
          <Outlet />
        </Content>
      </Layout>
      <Tour open={tourOpen && onboardingTourEnabled} onClose={closeTour} onFinish={closeTour} steps={tourSteps} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </Layout>
  );
}
