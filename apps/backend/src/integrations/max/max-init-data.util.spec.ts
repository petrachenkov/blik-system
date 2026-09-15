import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateMaxInitData } from './max-init-data.util.js';

const BOT_TOKEN = 'test-bot-token';

/** Строит валидную подписанную initData-строку — обратная операция к validateMaxInitData. */
function buildInitData(params: Record<string, string>, botToken = BOT_TOKEN): string {
  const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = sorted.map(([k, v]) => `${k}=${v}`).join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  return [...sorted.map(([k, v]) => `${k}=${encodeURIComponent(v)}`), `hash=${hash}`].join('&');
}

function baseParams(authDate = Math.floor(Date.now() / 1000)) {
  return {
    auth_date: String(authDate),
    query_id: 'q1',
    user: JSON.stringify({ id: 12345, first_name: 'Ivan' }),
    chat: JSON.stringify({ id: 999, type: 'DIALOG' }),
  };
}

describe('validateMaxInitData', () => {
  it('принимает корректно подписанные данные', () => {
    const initData = buildInitData(baseParams());
    const result = validateMaxInitData(initData, BOT_TOKEN);
    expect(result).not.toBeNull();
    expect(result?.userId).toBe('12345');
    expect(result?.chatId).toBe('999');
  });

  it('отклоняет данные, подписанные другим токеном бота', () => {
    const initData = buildInitData(baseParams(), 'wrong-token');
    expect(validateMaxInitData(initData, BOT_TOKEN)).toBeNull();
  });

  it('отклоняет данные с подделанным полем после подписи', () => {
    const initData = buildInitData(baseParams());
    const tampered = initData.replace('query_id=q1', 'query_id=q2');
    expect(validateMaxInitData(tampered, BOT_TOKEN)).toBeNull();
  });

  it('отклоняет просроченный auth_date', () => {
    const oldDate = Math.floor(Date.now() / 1000) - 25 * 3600; // 25 часов назад
    const initData = buildInitData(baseParams(oldDate));
    expect(validateMaxInitData(initData, BOT_TOKEN, 24 * 3600_000)).toBeNull();
  });

  it('отклоняет отсутствие hash', () => {
    expect(validateMaxInitData('auth_date=123&user=%7B%22id%22%3A1%7D', BOT_TOKEN)).toBeNull();
  });

  it('отклоняет пустые initData/botToken', () => {
    expect(validateMaxInitData('', BOT_TOKEN)).toBeNull();
    expect(validateMaxInitData(buildInitData(baseParams()), '')).toBeNull();
  });
});
