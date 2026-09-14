import { isAxiosError } from 'axios';

/** Достаёт человекочитаемое сообщение из ответа NestJS (HttpExceptionFilter) либо даёт запасной текст. */
export function extractErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined;
    if (data?.message) {
      return Array.isArray(data.message) ? data.message.join(', ') : data.message;
    }
  }
  return fallback;
}
