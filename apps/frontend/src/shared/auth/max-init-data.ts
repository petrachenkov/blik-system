declare global {
  interface Window {
    WebApp?: { initData?: string };
  }
}

/** Сырая подпись MAX: сервер проверяет её до входа или создания привязки. */
export function getMaxInitData(): string | null {
  if (window.WebApp?.initData) return window.WebApp.initData;
  // Данные запуска доступны до загрузки Bridge SDK с CDN.
  return new URLSearchParams(window.location.hash.slice(1)).get('WebAppData') || null;
}
