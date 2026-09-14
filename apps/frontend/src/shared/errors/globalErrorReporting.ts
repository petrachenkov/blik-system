import { reportError } from '../api/system';

const seen = new Set<string>();
let lastSentAt = 0;
const MIN_INTERVAL_MS = 10_000;

function send(message: string, stack?: string) {
  if (!message) return;
  if (!navigator.onLine) return;
  if (seen.has(message)) return; // дедуп в рамках сессии
  const now = Date.now();
  if (now - lastSentAt < MIN_INTERVAL_MS) return; // троттлинг
  seen.add(message);
  lastSentAt = now;
  void reportError({ message: message.slice(0, 2000), stack, url: window.location.href });
}

/** Глобальные обработчики необработанных ошибок и rejection'ов (см. план "Трекинг ошибок"). */
export function installGlobalErrorReporting() {
  window.addEventListener('error', (event) => {
    send(event.message || String(event.error), event.error?.stack);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    send(`Unhandled promise rejection: ${message}`, reason instanceof Error ? reason.stack : undefined);
  });
}
