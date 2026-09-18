import { Alert, Button, Grid, Layout, Menu, Space, Tour, Typography, Avatar, Dropdown, theme } from 'antd';
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
  HomeOutlined,
  SearchOutlined,
  BellOutlined,
  MessageOutlined,
  QrcodeOutlined,
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
  // Мобильная вёрстка шапки (см. фидбэк со скриншотом — на узком экране текст с именем/ролью
  // переносился и вылезал за пределы фиксированной высоты Header, а стандартный триггер
  // сворачивания Sider при collapsedWidth=0 рисуется отдельным "плавающим" квадратом поверх
  // контента). Управляем collapsed сами и рисуем свою кнопку-гамбургер внутри Header.
  const [collapsed, setCollapsed] = useState(false);
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;
  // У преподавателя (не staff) в меню всего 3 пункта — на мобильном выезжающий Sider ради
  // них избыточен (и был источником отдельных багов), вместо него — нижняя панель вкладок,
  // привычный мобильный паттерн (см. фидбэк со скриншотом).
  const isTeacher = user ? !isStaffRole(user.role) : false;
  const showBottomNav = isMobile && isTeacher;
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
    // База знаний — все, кто реально решает заявки (сисадмин + практикант).
    ...(isStaffRole(user.role)
      ? [{ key: '/knowledge', icon: <ReadOutlined />, label: 'База знаний' }]
      : []),
    // Группа "Картриджи" — вне ADMIN-блока ниже, т.к. заявку (/cartridges) подаёт любой
    // преподаватель, а приём с заправки сканером — сисадмин+практикант (см. план "Печать
    // этикеток картриджей"); остальные три пункта внутри — по-прежнему только сисадмину.
    {
      key: 'group-cartridges',
      type: 'group' as const,
      label: 'Картриджи',
      children: [
        { key: '/cartridges', icon: <PrinterOutlined />, label: 'Заявки' },
        ...(isStaffRole(user.role)
          ? [{ key: '/admin/cartridge-arrival', icon: <QrcodeOutlined />, label: 'Приём с заправки (сканер)' }]
          : []),
        ...(user.role === 'ADMIN'
          ? [
              { key: '/admin/cartridge-reports', icon: <FileExcelOutlined />, label: 'Отчёты' },
              { key: '/admin/cartridge-archive', icon: <InboxOutlined />, label: 'Архив заправленных' },
              { key: '/admin/refill-events', icon: <CalendarOutlined />, label: 'Плановые заправки' },
            ]
          : []),
      ],
    },
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

  const bottomNavItems = [
    { key: '/tickets', icon: <UnorderedListOutlined />, label: 'Заявки' },
    { key: '/tickets/new', icon: <PlusOutlined />, label: 'Новая заявка' },
    { key: '/cartridges', icon: <PrinterOutlined />, label: 'Картриджи' },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {showBottomNav ? (
        // Нижняя панель вместо Sider — тот же ref, чтобы онбординг-тур по-прежнему имел
        // валидную цель для первого шага.
        <div
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
            const active = location.pathname === item.key;
            return (
              <button
                key={item.key}
                onClick={() => navigate(item.key)}
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
        <>
          {/* Затемнение позади выезжающего меню на мобильном — тап закрывает меню. На десктопе
              Sider всегда в нормальном потоке (permanent), затемнение не нужно и не рендерится. */}
          {isMobile && !collapsed && (
            <div
              onClick={() => setCollapsed(true)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 99 }}
            />
          )}
          <Sider
            ref={siderRef}
            breakpoint="lg"
            collapsedWidth="0"
            trigger={null}
            collapsed={collapsed}
            onBreakpoint={setCollapsed}
            style={{
              background: SIDER_BG,
              // На мобильном — фиксированный оверлей поверх всего (включая Header), а не
              // обычный flex-child, который раньше просто сжимал Content вместо содержимого
              // (см. фидбэк со скриншотом — текст переносился по буквам в узкую полоску).
              ...(isMobile ? { position: 'fixed', insetInlineStart: 0, top: 0, bottom: 0, zIndex: 100 } : {}),
            }}
          >
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
              onClick={({ key }) => {
                navigate(key);
                if (isMobile) setCollapsed(true);
              }}
            />
          </Sider>
        </>
      )}
      <Layout>
        <Header
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
          {isMobile && !showBottomNav ? (
            <Button type="text" icon={<MenuOutlined />} onClick={() => setCollapsed((c) => !c)} title="Меню" />
          ) : (
            <span />
          )}
          <Space size={isMobile ? 0 : 8} style={{ flexShrink: 0 }}>
            <Button
              type="text"
              icon={<SearchOutlined />}
              onClick={() => setPaletteOpen(true)}
              title="Поиск (Ctrl/Cmd + K)"
              style={{ color: token.colorTextSecondary }}
            >
              {!isMobile && <Typography.Text type="secondary" style={{ fontSize: 12 }}>⌘K</Typography.Text>}
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
                {/* Имя/роль скрываем на узких экранах — не помещались в шапку и переносились
                    поверх контента (см. фидбэк со скриншотом); имя всё ещё видно по клику
                    на аватар — не критичная потеря, дропдаун и так открывается по тапу. */}
                {!isMobile && (
                  <Typography.Text>
                    {user.fullName} <Typography.Text type="secondary">· {ROLE_LABELS[user.role]}</Typography.Text>
                  </Typography.Text>
                )}
              </Space>
            </Dropdown>
          </Space>
        </Header>
        {/* Небольшой отступ, а не 0, сохранён намеренно: у карточек внутри страниц есть Row
            с gutter (отрицательные поля grid-системы) — без этого запаса появляется
            горизонтальный скролл на всю ширину экрана. */}
        <Content style={{ padding: 16, paddingBottom: showBottomNav ? 72 : 16 }}>
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
