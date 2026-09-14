import { z } from 'zod';

/**
 * Схема и валидация переменных окружения. Падает при старте, если чего-то не хватает —
 * лучше узнать об этом сразу, а не при первом обращении к LDAP/БД.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL обязателен'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET должен быть достаточно длинным'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET должен быть достаточно длинным'),
  JWT_REFRESH_TTL: z.string().default('14d'),

  MASTER_USERNAME: z.string().min(1),
  MASTER_PASSWORD: z.string().min(8, 'MASTER_PASSWORD должен быть не короче 8 символов'),
  MASTER_FULL_NAME: z.string().default('Master Administrator'),

  LDAP_URL: z.string().min(1),
  LDAP_BIND_DN: z.string().min(1),
  LDAP_BIND_PASSWORD: z.string().min(1),
  LDAP_BASE_DN: z.string().min(1),
  LDAP_STAFF_GROUP_DN: z.string().min(1),
  // Для ldaps:// с сертификатом от внутреннего (не публичного) CA колледжа — Node его не
  // доверяет по умолчанию. По-хорошему нужно подложить сертификат этого CA (LDAP_TLS_CA_PATH
  // ниже), но пока его нет под рукой — можно временно отключить проверку через это. Не для
  // продакшена: default остаётся безопасным (true), включать false нужно явно в .env.
  // ВАЖНО: не z.coerce.boolean() — оно превращает ЛЮБУЮ непустую строку (в т.ч. "false") в
  // true, потому что под капотом просто Boolean(value), а в JS непустая строка всегда truthy.
  LDAP_TLS_REJECT_UNAUTHORIZED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  // Путь к PEM-файлу с сертификатом внутреннего CA — правильная замена флагу выше.
  LDAP_TLS_CA_PATH: z.string().optional(),

  UPLOADS_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().default(25),
  MAX_VIDEO_UPLOAD_SIZE_MB: z.coerce.number().default(200),

  // Web Push (см. план "Push-уведомления браузера") — оба ключа опциональны: если не заданы,
  // канал просто выключен (isEnabledFor вернёт false, подписок не будет — фронт не сможет
  // вызвать subscribe без публичного ключа). Сгенерировать: npx web-push generate-vapid-keys.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:admin@example.com'),
  // "Тихие часы" уведомлений настраиваются через UI (см. NotificationSettings в schema.prisma
  // и /admin/quiet-hours), не через .env — Главный сисадмин не может редактировать .env
  // и перезапускать сервер ради смены часов.
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Некорректная конфигурация окружения:\n${issues}`);
  }
  return parsed.data;
}
