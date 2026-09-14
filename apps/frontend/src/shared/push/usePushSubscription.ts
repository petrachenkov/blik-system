import { useEffect, useState } from 'react';
import { fetchVapidPublicKey, subscribeToPush, unsubscribeFromPush } from '../api/notifications';

/** 'unsupported' — браузер не умеет Web Push (например, Safari на iOS < 16.4) — тогда
 * переключатель в UI вообще не показываем, а не показываем его отключённым без объяснений. */
export type PushSupportState = 'checking' | 'unsupported' | 'subscribed' | 'unsubscribed';

// VAPID-ключ приходит в URL-safe base64 (см. web-push), а SubscriptionOptions ждёт Uint8Array.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const isSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/**
 * pushManager.subscribe() — это сетевой round-trip до push-сервиса браузера (у Chrome — Google
 * FCM), и при проблемах с доступом до него браузер не бросает ошибку, а просто зависает без
 * какого-либо таймаута (проверено на практике: ни resolve, ни reject за 30+ секунд). Без этой
 * обёртки пользователь просто бесконечно видел крутящийся индикатор без объяснений.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

/** Инкапсулирует регистрацию service worker + подписку/отписку от Web Push
 * (см. план "Push-уведомления браузера") — используется переключателем в NotificationBell. */
export function usePushSubscription() {
  // Поддержка браузером — статичный факт окружения, а не что-то, что меняется за время жизни
  // компонента: считаем один раз при инициализации state, а не setState синхронно внутри эффекта.
  const [state, setState] = useState<PushSupportState>(() => (isSupported() ? 'checking' : 'unsupported'));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSupported()) return;
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => registration.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'subscribed' : 'unsubscribed'))
      .catch(() => setState('unsupported'));
  }, []);

  const subscribe = async () => {
    setBusy(true);
    try {
      const publicKey = await fetchVapidPublicKey();
      if (!publicKey) {
        throw new Error('Push-уведомления не настроены на сервере');
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Разрешение на уведомления не выдано');
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await withTimeout(
        registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        }),
        20_000,
        'Не удалось связаться с push-сервисом браузера (истекло время ожидания) — возможно, сеть блокирует доступ к серверам push-уведомлений',
      );
      await subscribeToPush(subscription.toJSON() as PushSubscriptionJSON);
      setState('subscribed');
    } finally {
      setBusy(false);
    }
  };

  const unsubscribe = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await unsubscribeFromPush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState('unsubscribed');
    } finally {
      setBusy(false);
    }
  };

  return { state, busy, subscribe, unsubscribe };
}
