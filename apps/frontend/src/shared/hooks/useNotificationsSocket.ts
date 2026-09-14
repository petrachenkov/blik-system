import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { notification as antdNotification } from 'antd';
import { getAccessToken } from '../api/client';
import type { AppNotification } from '../types';

let socket: Socket | null = null;

/**
 * Подключается к WS-namespace уведомлений при входе пользователя, инвалидирует кэш
 * и показывает всплывающее уведомление при получении пуша (см. NotificationsGateway на бэкенде).
 */
export function useNotificationsSocket(isLoggedIn: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = getAccessToken();
    if (!isLoggedIn || !token) {
      socket?.disconnect();
      socket = null;
      return;
    }

    socket = io('/notifications', { query: { token }, transports: ['websocket', 'polling'] });

    socket.on('notification', (payload: AppNotification) => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      antdNotification.info({ message: payload.title, description: payload.body, placement: 'topRight' });
    });

    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, [isLoggedIn, queryClient]);
}
