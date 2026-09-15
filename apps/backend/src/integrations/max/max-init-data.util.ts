import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Проверенные данные из `initData` мини-приложения MAX (см. план "Мини-приложение MAX").
 * `userId`/`chatId` — идентификаторы MAX-стороны, не имеют отношения к Blik `User.id`
 * до тех пор, пока не найдена/не создана запись `MaxLink`.
 */
export interface MaxInitData {
  userId: string;
  chatId: string;
  authDate: number;
  raw: Record<string, string>;
}

/**
 * Валидация `initData`, присланной MAX-клиентом мини-приложения — алгоритм 1-в-1 по
 * официальной документации (https://dev.max.ru/docs/webapps/validation): разбить по `&`,
 * исключить `hash`, URL-декодировать значения, отсортировать по ключу, склеить через `\n`,
 * подписать HMAC-SHA256(secret_key, строка), где secret_key = HMAC-SHA256("WebAppData", токен
 * бота). Совпадение с присланным `hash` — доказательство, что данные действительно от MAX,
 * а не подделаны клиентом (initData передаётся и хранится на фронте открытым текстом).
 *
 * `maxAgeMs` — своя защита от replay поверх схемы из документации (там TTL не оговорен, но
 * это тот же паттерн, что у Telegram WebApps, где `auth_date` принято ограничивать по возрасту).
 */
export function validateMaxInitData(initData: string, botToken: string, maxAgeMs = 24 * 3600_000): MaxInitData | null {
  if (!initData || !botToken) return null;

  const pairs = initData.split('&').map((part) => {
    const idx = part.indexOf('=');
    return idx === -1 ? [part, ''] : [part.slice(0, idx), part.slice(idx + 1)];
  });

  const hashPairs = pairs.filter(([key]) => key === 'hash');
  if (hashPairs.length !== 1) return null;
  const originalHash = hashPairs[0][1];
  if (!originalHash) return null;

  const decoded = pairs.map(([key, value]) => [key, decodeURIComponent(value)] as const);
  const sorted = [...decoded].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = sorted
    .filter(([key]) => key !== 'hash')
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const signature = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const signatureBuf = Buffer.from(signature, 'hex');
  const originalBuf = Buffer.from(originalHash, 'hex');
  if (signatureBuf.length !== originalBuf.length || !timingSafeEqual(signatureBuf, originalBuf)) {
    return null;
  }

  const raw = Object.fromEntries(decoded);
  const authDate = Number(raw.auth_date);
  if (!Number.isFinite(authDate)) return null;
  if (Date.now() - authDate * 1000 > maxAgeMs) return null;

  // `user`/`chat` — JSON-сериализованные объекты внутри query-строки (как в исходном
  // InitData-интерфейсе из документации: user:{id,...}, chat:{id,type}). Если на реальном
  // боевом initData формат окажется другим — поправить парсинг здесь, остальной алгоритм
  // (проверка подписи) от этого не зависит.
  let userId: string | undefined;
  let chatId: string | undefined;
  try {
    if (raw.user) userId = String(JSON.parse(raw.user).id);
    if (raw.chat) chatId = String(JSON.parse(raw.chat).id);
  } catch {
    return null;
  }
  if (!userId) return null;

  return { userId, chatId: chatId ?? '', authDate, raw };
}
