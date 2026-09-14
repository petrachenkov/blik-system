import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { getAccessToken } from '../api/client';
import type { TicketComment } from '../types';

interface TypingUser {
  userId: string;
  fullName: string;
}

/**
 * Realtime по конкретной заявке — «печатает…» и появление новых комментариев без ручного
 * обновления страницы (см. план "«Печатает…» + live-обновление чата"). Отдельный namespace
 * от useNotificationsSocket (тот глобальный по userId, этот — по ticketId), см. TicketsGateway
 * на бэкенде.
 */
export function useTicketRoomSocket(ticketId: string | undefined, enabled = true) {
  const queryClient = useQueryClient();
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const lastTypingEmitRef = useRef(0);

  useEffect(() => {
    const token = getAccessToken();
    if (!ticketId || !token || !enabled) return;

    const socket = io('/tickets', { query: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.emit('join', { ticketId });

    socket.on('comment', (comment: TicketComment) => {
      queryClient.setQueryData<TicketComment[]>(['tickets', ticketId, 'comments'], (old) => {
        if (!old) return old;
        if (old.some((c) => c.id === comment.id)) return old;
        return [...old, comment];
      });
    });

    // Таймер на пользователя — "печатает" гаснет через 3с без повторного события, без
    // нужды в отдельном сигнале "перестал печатать" от отправителя.
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    socket.on('typing', ({ userId, fullName }: TypingUser) => {
      setTypingUsers((prev) => (prev.some((u) => u.userId === userId) ? prev : [...prev, { userId, fullName }]));
      const existing = timers.get(userId);
      if (existing) clearTimeout(existing);
      timers.set(
        userId,
        setTimeout(() => {
          setTypingUsers((prev) => prev.filter((u) => u.userId !== userId));
          timers.delete(userId);
        }, 3000),
      );
    });

    return () => {
      socket.emit('leave', { ticketId });
      socket.disconnect();
      socketRef.current = null;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      setTypingUsers([]);
    };
  }, [ticketId, queryClient, enabled]);

  // Троттлинг — не чаще раза в 2с, иначе каждое нажатие клавиши слало бы событие.
  const notifyTyping = () => {
    const now = Date.now();
    if (now - lastTypingEmitRef.current < 2000) return;
    lastTypingEmitRef.current = now;
    socketRef.current?.emit('typing', { ticketId });
  };

  return { typingUsers, notifyTyping };
}
