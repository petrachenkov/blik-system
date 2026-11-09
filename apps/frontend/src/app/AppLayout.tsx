import { Alert, Button, Drawer, Grid, Layout, Menu, Space, Tour, Typography, Avatar, Dropdown, theme } from 'antd';
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
  MenuOutlined,
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
  DownOutlined,
  HomeOutlined,
  SearchOutlined,
  BellOutlined,
  MessageOutlined,
  QrcodeOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
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

type NavigationItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  children?: NavigationItem[];
};

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [menuExpansion, setMenuExpansion] = useState<{ route: string; key?: string }>();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;
  // У преподавателя (не staff) в меню всего 3 пункта — на мобильном выезжающий Sider ради
  // них избыточен (и был источником отдельных багов), вместо него — нижняя панель вкладок,
  // привычный мобильный паттерн (см. фидбэк со скриншотом).
  const isTeacher = user ? !isStaffRole(user.role) : false;
  const showBottomNav = isMobile;
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

  const isAdmin = user.role === 'ADMIN';
  const calendarItem = { key: '/calendar', icon: <CalendarOutlined />, label: 'Календарь' };
  const cartridgesItem = { key: '/cartridges', icon: <PrinterOutlined />, label: 'Картриджи' };

  const menuItems: NavigationItem[] = [
    ...(!isTeacher
      ? [{ key: '/dashboard', icon: <HomeOutlined />, label: 'Главная' }]
      : []),
    { key: '/tickets', icon: <UnorderedListOutlined />, label: 'Заявки' },
    { key: '/tickets/new', icon: <PlusOutlined />, label: 'Новая заявка' },
    ...(!isTeacher ? [{ key: '/knowledge', icon: <ReadOutlined />, label: 'База знаний' }] : []),
    ...(isAdmin ? [{ key: '/services', icon: <AppstoreOutlined />, label: 'Сервисы' }] : []),
    ...(!isTeacher && visitsEnabled
      ? [isAdmin ? {
          key: 'group-scheduling',
          label: 'Календарь и визиты',
          children: [
            calendarItem,
            { key: '/admin/working-hours', icon: <CarryOutOutlined />, label: 'Рабочие часы визитов' },
          ],
        } : calendarItem]
      : []),
    isTeacher ? cartridgesItem : {
      key: 'group-cartridges',
      label: cartridgesItem.label,
      children: [
        { ...cartridgesItem, label: 'Заявки на заправку' },
        { key: '/admin/cartridge-arrival', icon: <QrcodeOutlined />, label: 'Приём с заправки' },
        ...(isAdmin
          ? [
              { key: '/admin/refill-events', icon: <CalendarOutlined />, label: 'Плановые заправки' },
              { key: '/admin/cartridge-reports', icon: <FileExcelOutlined />, label: 'Отчёты по заправке' },
              { key: '/admin/cartridge-archive', icon: <InboxOutlined />, label: 'Архив заправленных' },
            ]
          : []),
      ],
    },
    ...(isAdmin
      ? [
          {
            key: 'group-directory',
            label: 'Справочники',
            children: [
              { key: '/admin/categories', icon: <TagsOutlined />, label: 'Категории заявок' },
              { key: '/admin/tags', icon: <TagsOutlined />, label: 'Теги заявок' },
              { key: '/admin/locations', icon: <EnvironmentOutlined />, label: 'Локации' },
            ],
          },
          {
            key: 'group-ticket-management',
            label: 'Настройки и архив заявок',
            children: [
              { key: '/admin/sla', icon: <ClockCircleOutlined />, label: 'Сроки SLA' },
              { key: '/admin/text-snippets', icon: <FileTextOutlined />, label: 'Шаблоны текста' },
              { key: '/admin/ticket-archive', icon: <InboxOutlined />, label: 'Архив заявок' },
            ],
          },
          {
            key: 'group-accounts',
            label: 'Учётные записи',
            children: [
              { key: '/admin/users', icon: <TeamOutlined />, label: 'Пользователи' },
              { key: '/admin/login-log', icon: <SafetyOutlined />, label: 'Журнал входов' },
            ],
          },
          {
            key: 'group-notifications',
            label: 'Оповещения',
            children: [
              { key: '/admin/broadcast', icon: <NotificationOutlined />, label: 'Рассылка' },
              { key: '/admin/announcement', icon: <SoundOutlined />, label: 'Объявление' },
              { key: '/admin/quiet-hours', icon: <ClockCircleOutlined />, label: 'Тихие часы' },
            ],
          },
          {
            key: 'group-analytics',
            label: 'Статистика и панель',
            children: [
              { key: '/admin/assignee-stats', icon: <BarChartOutlined />, label: 'Статистика исполнителей' },
              ...(wallboardEnabled
                ? [{ key: '/admin/wallboard', icon: <DesktopOutlined />, label: 'Настенная панель' }]
                : []),
            ],
          },
          {
            key: 'group-system',
            label: 'Обслуживание Blik',
            children: [
              { key: '/admin/system-health', icon: <HeartOutlined />, label: 'Здоровье системы' },
              { key: '/admin/error-log', icon: <BugOutlined />, label: 'Журнал ошибок' },
              { key: '/admin/feature-flags', icon: <ControlOutlined />, label: 'Флаги функциональности' },
            ],
          },
        ]
      : []),
  ];

  const bottomNavItems = isTeacher ? [
    { key: '/tickets', icon: <UnorderedListOutlined />, label: 'Заявки' },
    { key: '/tickets/new', icon: <PlusOutlined />, label: 'Новая заявка' },
    { key: '/cartridges', icon: <PrinterOutlined />, label: 'Картриджи' },
  ] : [
    { key: '/dashboard', icon: <HomeOutlined />, label: 'Главная' },
    { key: '/tickets', icon: <UnorderedListOutlined />, label: 'Заявки' },
    { key: '/tickets/new', icon: <PlusOutlined />, label: 'Создать' },
    ...(isAdmin ? [{ key: '/services', icon: <AppstoreOutlined />, label: 'Сервисы' }] : []),
    { key: 'more', icon: <MenuOutlined />, label: 'Ещё' },
  ];

  const route = location.pathname;
  const activeKey = route.startsWith('/tickets/') && route !== '/tickets/new'
    ? '/tickets'
    : route.startsWith('/knowledge/') ? '/knowledge' : route;
  const activeGroup = menuItems.find((item) => item.children?.some((child) => child.key === activeKey));
  const activeItem = activeGroup?.children?.find((child) => child.key === activeKey)
    ?? menuItems.find((item) => item.key === activeKey);
  const openGroup = menuExpansion?.route === route ? menuExpansion.key : activeGroup?.key;

  return (
    <Layout className="app-shell" style={{ minHeight: '100dvh' }}>
      {showBottomNav ? (
        // Нижняя панель вместо Sider — тот же ref, чтобы онбординг-тур по-прежнему имел
        // валидную цель для первого шага.
        <div
          className="mobile-bottom-nav"
          ref={siderRef}
          style={{
            position: 'fixed',
            insetInline: 0,
            bottom: 0,
            zIndex: 100,
            display: 'flex',
            background: SIDER_BG,
            boxShadow: '0 -1px 8px rgba(0,0,0,0.3)',
          }}
        >
          {bottomNavItems.map((item) => {
            const active = location.pathname === item.key || (item.key === '/tickets' && location.pathname.startsWith('/tickets/') && location.pathname !== '/tickets/new');
            return (
              <button
                key={item.key}
                aria-current={active ? 'page' : undefined}
                onClick={() => item.key === 'more' ? setMobileMenuOpen(true) : navigate(item.key)}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  padding: '8px 0',
                  border: 'none',
                  background: 'transparent',
                  color: active ? '#fff' : 'rgba(255,255,255,0.65)',
                  fontSize: 11,
                }}
              >
                <span style={{ fontSize: 20 }}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </div>
      ) : (
          <Sider
            ref={siderRef}
            className="desktop-sidebar"
            width="clamp(218px, 16.5vw, 254px)"
            trigger={null}
            style={{ background: SIDER_BG }}
          >
            <button type="button" className="desktop-brand" onClick={() => navigate('/')} aria-label="Blik — на главную">
              <img src="/logo-blue.png" alt="" />
              <span><strong>Blik</strong><small>Техподдержка</small></span>
            </button>
            <nav className="desktop-navigation" aria-label="Разделы Blik">
              <Menu
                theme="dark"
                mode="inline"
                inlineIndent={14}
                selectedKeys={[activeKey]}
                openKeys={openGroup ? [openGroup] : []}
                items={menuItems}
                onOpenChange={(keys) => setMenuExpansion({ route, key: keys.at(-1) })}
                onClick={({ key }) => navigate(key)}
              />
            </nav>
          </Sider>
      )}
      {isMobile && !isTeacher && <Drawer title="Все разделы" placement="left" open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} size="min(320px, 90vw)" styles={{ body: { padding: 0, background: SIDER_BG } }}>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[activeKey]}
          items={menuItems.map((item) => item.children ? { ...item, type: 'group' as const } : item)}
          style={{ background: SIDER_BG }}
          onClick={({ key }) => { navigate(key); setMobileMenuOpen(false); }}
        />
      </Drawer>}
      <Layout style={{ minWidth: 0 }}>
        <Header
          className="app-header"
          style={{
            background: token.colorBgContainer,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            padding: isMobile ? '0 8px' : '0 24px',
            height: 64,
            lineHeight: 'normal',
            boxShadow: `0 1px 4px ${token.colorBorderSecondary}`,
            zIndex: 1,
          }}
        >
          {isMobile ? <Typography.Text strong style={{ fontSize: 20 }}>Blik</Typography.Text> : (
            <div className="desktop-page-label">
              {activeGroup && <Typography.Text type="secondary">{activeGroup.label}</Typography.Text>}
              <Typography.Text strong>{activeItem?.label ?? 'Настройки'}</Typography.Text>
            </div>
          )}
          <Space className="app-header-actions" size={isMobile ? 0 : 8}>
            <Button
              type="text"
              icon={<SearchOutlined />}
              onClick={() => setPaletteOpen(true)}
              title="Поиск (Ctrl/Cmd + K)"
              style={{ color: token.colorTextSecondary }}
            >
              {!isMobile && <span className="desktop-search-label">Поиск</span>}
            </Button>
            {!isMobile && (
              <Button type="text" shape="circle" icon={<QuestionCircleOutlined />} title="Показать обзор снова" onClick={() => setTourOpen(true)} />
            )}
            <span ref={themeRef} style={{ display: 'inline-flex' }}>
              <ThemeToggle />
            </span>
            <span ref={bellRef} style={{ display: 'inline-flex' }}>
              <NotificationBell />
            </span>
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  { key: 'profile-name', label: `${user.fullName} · ${ROLE_LABELS[user.role]}`, disabled: true },
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
              <Button type="text" className="app-profile" aria-label="Профиль и настройки">
                <Avatar style={{ backgroundColor: ROLE_COLORS[user.role] }} icon={<UserOutlined />} />
                {/* Имя/роль скрываем на узких экранах — не помещались в шапку и переносились
                    поверх контента (см. фидбэк со скриншотом); имя всё ещё видно по клику
                    на аватар — не критичная потеря, дропдаун и так открывается по тапу. */}
                {!isMobile && (
                  <span className="desktop-profile-details">
                    <span className="desktop-profile-name">
                      <Typography.Text ellipsis title={user.fullName}>{user.fullName}</Typography.Text>
                      <Typography.Text type="secondary">{ROLE_LABELS[user.role]}</Typography.Text>
                    </span>
                    <DownOutlined className="desktop-profile-chevron" />
                  </span>
                )}
              </Button>
            </Dropdown>
          </Space>
        </Header>
        {/* Небольшой отступ, а не 0, сохранён намеренно: у карточек внутри страниц есть Row
            с gutter (отрицательные поля grid-системы) — без этого запаса появляется
            горизонтальный скролл на всю ширину экрана. */}
        <Content className="app-content" style={{ padding: isMobile ? 12 : 24, paddingBottom: showBottomNav ? 'calc(88px + env(safe-area-inset-bottom))' : 24, minWidth: 0 }}>
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
          <div className="app-page"><Outlet /></div>
        </Content>
      </Layout>
      <Tour open={tourOpen && onboardingTourEnabled} onClose={closeTour} onFinish={closeTour} steps={tourSteps} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </Layout>
  );
}
