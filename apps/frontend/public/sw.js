// Service worker для Web Push (см. план "Push-уведомления браузера"). Ничего не кеширует —
// единственная задача: показать системное уведомление браузера по приходу push-сообщения
// и открыть/сфокусировать вкладку с нужной заявкой по клику на него.

self.addEventListener('push', (event) => {
  let data = { title: 'Blik', body: 'Новое уведомление' };
  try {
    if (event.data) data = event.data.json();
  } catch {
    // тело push не JSON — покажем дефолтный текст, а не упадём
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/logo-blue.png',
      data: { ticketId: data.ticketId ?? null },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const ticketId = event.notification.data?.ticketId;
  const url = ticketId ? `/tickets/${ticketId}` : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
