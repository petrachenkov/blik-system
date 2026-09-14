/**
 * Реестр флагов функциональности (см. план "Флаги функциональности") — единый источник
 * правды для бэкенда и админки. Добавление флага: строка сюда + идемпотентный upsert в seed.ts.
 *
 * maintenance_mode намеренно НЕ здесь — это отдельный well-known ключ в той же таблице
 * SystemFlag, но со своей семантикой (режим обслуживания, см. MAINTENANCE_FLAG_KEY).
 */
export const FEATURE_FLAGS = {
  WALLBOARD: 'wallboard',
  AUTO_TAGGING: 'auto_tagging',
  WEB_PUSH: 'web_push',
  LIVE_CHAT: 'live_chat',
  KB_SUGGESTIONS: 'kb_suggestions',
  ONBOARDING_TOUR: 'onboarding_tour',
  MENTIONS: 'mentions',
  VISITS: 'visits',
} as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

export const FEATURE_FLAG_KEYS: string[] = Object.values(FEATURE_FLAGS);

export const MAINTENANCE_FLAG_KEY = 'maintenance_mode';

/** Все ключи, которые сид обязан создать в таблице (реестр + режим обслуживания). */
export const ALL_FLAG_KEYS: string[] = [...FEATURE_FLAG_KEYS, MAINTENANCE_FLAG_KEY];

export const FEATURE_FLAG_META: Record<string, { label: string; description: string }> = {
  [FEATURE_FLAGS.WALLBOARD]: {
    label: 'Настенная панель',
    description: 'Полноэкранная сводка очереди/просрочек для телевизора в дежурке и kiosk-ссылки к ней.',
  },
  [FEATURE_FLAGS.AUTO_TAGGING]: {
    label: 'Авто-тегирование заявок',
    description: 'Автоматическая простановка тегов новой заявке по ключевым словам в описании.',
  },
  [FEATURE_FLAGS.WEB_PUSH]: {
    label: 'Push-уведомления браузера',
    description: 'Переключатель push-подписки в колокольчике и доставка уведомлений через Web Push.',
  },
  [FEATURE_FLAGS.LIVE_CHAT]: {
    label: 'Живой чат заявки',
    description: 'Индикатор «печатает…» и мгновенное появление новых комментариев без обновления страницы.',
  },
  [FEATURE_FLAGS.KB_SUGGESTIONS]: {
    label: 'Подсказки базы знаний',
    description: 'Подбор релевантных статей БЗ по тексту описания при создании заявки.',
  },
  [FEATURE_FLAGS.ONBOARDING_TOUR]: {
    label: 'Онбординг-тур',
    description: 'Пошаговый обзор интерфейса при первом входе нового пользователя.',
  },
  [FEATURE_FLAGS.MENTIONS]: {
    label: '@упоминания коллег',
    description: 'Упоминание сотрудников в комментариях к заявке с отдельным уведомлением.',
  },
  [FEATURE_FLAGS.VISITS]: {
    label: 'Планирование визитов и работ',
    description: 'Календарь: согласование времени визита к преподавателю, задачи сотрудника (в т.ч. внутренние работы по заявке), рабочие часы, экран «Мой день».',
  },
  [MAINTENANCE_FLAG_KEY]: {
    label: 'Режим обслуживания',
    description: 'Баннер «идут технические работы» и блокировка входа для всех, кроме сисадминов.',
  },
};
