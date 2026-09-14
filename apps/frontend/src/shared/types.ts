export type UserRole = 'ADMIN' | 'INTERN' | 'USER';
export type UserSource = 'LDAP' | 'LOCAL';

export type TicketStatus = 'NEW' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'REJECTED' | 'REOPENED';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface CurrentUser {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: UserRole;
  isStaff: boolean;
  isMaster: boolean;
  source: UserSource;
  // Онбординг-тур ещё не показан, если null (см. план "Онбординг-тур").
  onboardingCompletedAt: string | null;
}

export interface UserListItem extends CurrentUser {
  department: string | null;
  lastLoginAt: string | null;
  openTicketsCount: number;
}

/** Урезанный профиль коллеги для @упоминаний (см. план "Упоминания") — GET /users/staff-directory. */
export interface StaffDirectoryUser {
  id: string;
  fullName: string;
  role: UserRole;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
}

export interface Location {
  id: string;
  building: string;
  room: string;
  label: string | null;
  isActive: boolean;
}

export interface SlaConfig {
  id: string;
  priority: TicketPriority;
  responseMinutes: number;
  resolutionMinutes: number;
}

export interface TicketRef {
  id: string;
  fullName: string;
  username: string;
}

export interface Ticket {
  id: string;
  number: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority | null;
  location: Location;
  category: Category | null;
  tags: { id: string; name: string; color: string | null }[];
  createdBy: TicketRef;
  assignedTo: TicketRef | null;
  responseDueAt: string | null;
  resolutionDueAt: string | null;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  isResponseBreached: boolean;
  isResolutionBreached: boolean;
  rating: number | null;
  ratingComment: string | null;
  ratedAt: string | null;
  archivedAt: string | null;
  collaborators: { userId: string; user: { id: string; fullName: string; role: UserRole } }[];
  createdAt: string;
  updatedAt: string;
}

export interface TicketListResponse {
  items: Ticket[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TicketAttachment {
  id: string;
  ticketId: string;
  commentId: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface KnowledgeArticleRef {
  id: string;
  title: string;
}

export interface TicketComment {
  id: string;
  ticketId: string;
  body: string;
  isSystem: boolean;
  isInternal: boolean;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  author: { id: string; fullName: string; role: UserRole } | null;
  attachments: TicketAttachment[];
  knowledgeArticles: KnowledgeArticleRef[];
  mentions: { id: string; fullName: string }[];
}

export interface TicketHistoryEntry {
  id: string;
  action: string;
  fromValue: string | null;
  toValue: string | null;
  createdAt: string;
  actor: { id: string; fullName: string; role: UserRole } | null;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  ticketId: string | null;
  isRead: boolean;
  createdAt: string;
}

// --- Заправка картриджей (независимый поток — см. план) ---

export type CartridgeRequestStatus = 'NEW' | 'COLLECTED' | 'SENT' | 'FILLED' | 'CANCELLED';
export type CartridgeReportStatus = 'GENERATED' | 'CLOSED';

export interface CartridgeRequest {
  id: string;
  number: string;
  code: string;
  status: CartridgeRequestStatus;
  location: Location;
  createdBy: TicketRef;
  collectedBy: TicketRef | null;
  collectedAt: string | null;
  reportId: string | null;
  report: { id: string; number: string } | null;
  filledAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CartridgeListResponse {
  items: CartridgeRequest[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CartridgeReport {
  id: string;
  number: string;
  status: CartridgeReportStatus;
  createdBy: TicketRef;
  closedBy: TicketRef | null;
  closedAt: string | null;
  filename: string;
  createdAt: string;
  _count: { requests: number };
}

export interface RefillEvent {
  id: string;
  scheduledAt: string;
  submissionDeadline: string;
  note: string | null;
  isCancelled: boolean;
  createdBy: TicketRef;
  createdAt: string;
}

// --- Статистика по исполнителям (см. план) ---

export interface AssigneeStats {
  userId: string;
  fullName: string;
  role: UserRole;
  openCount: number;
  totalAssignedCount: number;
  resolvedCount: number;
  rejectedCount: number;
  responseBreachedCount: number;
  resolutionBreachedCount: number;
  avgResponseMinutes: number | null;
  avgResolutionMinutes: number | null;
  avgRating: number | null;
}

// --- Общесайтовый баннер-объявление (см. план) ---

export interface SiteAnnouncement {
  text: string | null;
  updatedAt: string | null;
}

// --- База знаний (см. план) ---

export interface KnowledgeArticleExampleTicket {
  id: string;
  number: string;
  description: string;
  status: TicketStatus;
  createdAt: string;
  location: { building: string; room: string; label: string | null };
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  content: string;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  createdBy: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt: string;
  _count: { usedInComments: number };
}

export interface KnowledgeArticleAttachment {
  id: string;
  articleId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface KnowledgeArticleDetail extends KnowledgeArticle {
  exampleTickets: KnowledgeArticleExampleTicket[];
}

// --- Шаблоны текста (см. план "Шаблоны заявок" / "Шаблоны быстрых ответов") ---

export type SnippetKind = 'TICKET_TEMPLATE' | 'CANNED_RESPONSE';

export interface TextSnippet {
  id: string;
  kind: SnippetKind;
  title: string;
  body: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}
