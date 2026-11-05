/** Экранируем пользовательский текст и ограничиваем размер до добавления HTML-тегов. */
function escapeLimited(value: string, limit: number): string {
  let out = '';
  for (const char of value) {
    const escaped = char === '&' ? '&amp;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : char;
    if (out.length + escaped.length > limit) break;
    out += escaped;
  }
  return out;
}

export function formatMaxMessage(title: string, body: string): string {
  const heading = escapeLimited(title, 600);
  const prefix = `<b>${heading}</b>\n\n`;
  return prefix + escapeLimited(body, 4000 - prefix.length);
}
