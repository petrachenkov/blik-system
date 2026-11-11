const token = process.env.SCHEDULE_MAX_BOT_TOKEN;
const secret = process.env.SCHEDULE_MAX_WEBHOOK_SECRET;
const origin = process.env.CORS_ORIGIN?.split(',')[0].trim();

if (!token || token === process.env.MAX_BOT_TOKEN || !secret || !/^[a-zA-Z0-9_-]{5,256}$/.test(secret) || !origin) {
  throw new Error('Укажите отдельный SCHEDULE_MAX_BOT_TOKEN, SCHEDULE_MAX_WEBHOOK_SECRET и CORS_ORIGIN');
}

const url = new URL('/api/college-schedule/max/webhook', origin);
if (url.protocol !== 'https:' || url.port) throw new Error('Webhook MAX требует публичный HTTPS-адрес на порту 443');

const response = await fetch('https://platform-api2.max.ru/subscriptions', {
  method: 'POST',
  headers: { Authorization: token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: url.href, secret, update_types: ['bot_started', 'message_created'] }),
  signal: AbortSignal.timeout(10_000),
  redirect: 'error',
});
const result = await response.json().catch(() => null) as { success?: boolean; code?: string } | null;
if (!response.ok || !result?.success) {
  throw new Error(`Не удалось зарегистрировать webhook MAX (HTTP ${response.status})`);
}
console.log(`Webhook бота расписания зарегистрирован на ${url.href}`);

export {};
