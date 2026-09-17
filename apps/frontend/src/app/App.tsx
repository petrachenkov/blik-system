import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from '../features/auth/LoginPage';
import { TicketsListPage } from '../features/tickets/TicketsListPage';
import { CreateTicketPage } from '../features/tickets/CreateTicketPage';
import { TicketDetailPage } from '../features/tickets/TicketDetailPage';
import { DashboardPage } from '../features/tickets/DashboardPage';
import { CalendarPage } from '../features/visits/CalendarPage';
import { NotificationPreferencesPage } from '../features/settings/NotificationPreferencesPage';
import { TicketArchivePage } from '../features/admin/TicketArchivePage';
import { IndexRedirect } from './IndexRedirect';
import { CartridgesPage } from '../features/cartridges/CartridgesPage';
import { UsersPage } from '../features/admin/UsersPage';
import { CategoriesPage } from '../features/admin/CategoriesPage';
import { LocationsPage } from '../features/admin/LocationsPage';
import { SlaConfigPage } from '../features/admin/SlaConfigPage';
import { CartridgeReportsPage } from '../features/admin/CartridgeReportsPage';
import { CartridgeArrivalScanPage } from '../features/admin/CartridgeArrivalScanPage';
import { CartridgeArchivePage } from '../features/admin/CartridgeArchivePage';
import { RefillEventsPage } from '../features/admin/RefillEventsPage';
import { BroadcastNotificationPage } from '../features/admin/BroadcastNotificationPage';
import { AnnouncementPage } from '../features/admin/AnnouncementPage';
import { AssigneeStatsPage } from '../features/admin/AssigneeStatsPage';
import { LoginLogPage } from '../features/admin/LoginLogPage';
import { QuietHoursPage } from '../features/admin/QuietHoursPage';
import { WorkingHoursPage } from '../features/admin/WorkingHoursPage';
import { TextSnippetsPage } from '../features/admin/TextSnippetsPage';
import { TagsPage } from '../features/admin/TagsPage';
import { FeatureFlagsPage } from '../features/admin/FeatureFlagsPage';
import { SystemHealthPage } from '../features/admin/SystemHealthPage';
import { ErrorLogPage } from '../features/admin/ErrorLogPage';
import { WallboardKioskPage } from '../features/admin/WallboardKioskPage';
import { WallboardPage } from '../features/wallboard/WallboardPage';
import { KnowledgeBasePage } from '../features/knowledge/KnowledgeBasePage';
import { KnowledgeArticleDetailPage } from '../features/knowledge/KnowledgeArticleDetailPage';
import { MaxLinkPage } from '../features/settings/MaxLinkPage';
import { AppLayout } from './AppLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { MaxAppBootstrap } from './MaxAppBootstrap';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Настенная панель — вне общего layout и вне ProtectedRoute: телевизор открывает её
          по kiosk-ссылке без входа (доступ проверяется на бэкенде). */}
      <Route path="/wallboard" element={<WallboardPage />} />

      {/* Точка входа мини-приложения MAX (см. план) — своя логика входа до сессии, поэтому
          тоже вне ProtectedRoute/AppLayout; после входа обычный редирект в общий Blik. */}
      <Route path="/max" element={<MaxAppBootstrap />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          {/* Стартовая: сотрудник → дашборд, преподаватель → список своих заявок. */}
          <Route path="/" element={<IndexRedirect />} />
          <Route path="/tickets" element={<TicketsListPage />} />
          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'INTERN']} />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
          </Route>
          <Route path="/tickets/new" element={<CreateTicketPage />} />
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
          <Route path="/settings/notifications" element={<NotificationPreferencesPage />} />
          <Route path="/settings/max" element={<MaxLinkPage />} />
          <Route path="/cartridges" element={<CartridgesPage />} />
          {/* Открыта всем аутентифицированным — преподаватель может перейти сюда по ссылке
              из ответа на собственную заявку (см. план "База знаний"); список/создание — ниже,
              только сотрудникам техподдержки. */}
          <Route path="/knowledge/:id" element={<KnowledgeArticleDetailPage />} />

          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'INTERN']} />}>
            <Route path="/knowledge" element={<KnowledgeBasePage />} />
            <Route path="/admin/cartridge-arrival" element={<CartridgeArrivalScanPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/categories" element={<CategoriesPage />} />
            <Route path="/admin/locations" element={<LocationsPage />} />
            <Route path="/admin/sla" element={<SlaConfigPage />} />
            <Route path="/admin/text-snippets" element={<TextSnippetsPage />} />
            <Route path="/admin/tags" element={<TagsPage />} />
            <Route path="/admin/cartridge-reports" element={<CartridgeReportsPage />} />
            <Route path="/admin/cartridge-archive" element={<CartridgeArchivePage />} />
            <Route path="/admin/refill-events" element={<RefillEventsPage />} />
            <Route path="/admin/broadcast" element={<BroadcastNotificationPage />} />
            <Route path="/admin/announcement" element={<AnnouncementPage />} />
            <Route path="/admin/quiet-hours" element={<QuietHoursPage />} />
            <Route path="/admin/working-hours" element={<WorkingHoursPage />} />
            <Route path="/admin/ticket-archive" element={<TicketArchivePage />} />
            <Route path="/admin/assignee-stats" element={<AssigneeStatsPage />} />
            <Route path="/admin/login-log" element={<LoginLogPage />} />
            <Route path="/admin/system-health" element={<SystemHealthPage />} />
            <Route path="/admin/error-log" element={<ErrorLogPage />} />
            <Route path="/admin/feature-flags" element={<FeatureFlagsPage />} />
            <Route path="/admin/wallboard" element={<WallboardKioskPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
