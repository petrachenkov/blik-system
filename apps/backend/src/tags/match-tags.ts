export interface TagWithKeywords {
  id: string;
  isActive: boolean;
  rules: { keyword: string }[];
}

/**
 * Подбор тегов по ключевым словам в описании заявки (см. план "Авто-тегирование") —
 * подстрочный матч без учёта регистра. Именно подстрока, а не полнотекстовый поиск:
 * администратор задаёт точные ключи и их словоформы («wi-fi», «вайфай», «вай фай»),
 * в отличие от подсказок базы знаний, где на входе свободная проза.
 */
export function matchTagIds(description: string, tags: TagWithKeywords[]): string[] {
  const text = description.toLowerCase();
  return tags
    .filter((tag) => tag.isActive && tag.rules.some((r) => r.keyword && text.includes(r.keyword.toLowerCase())))
    .map((tag) => tag.id);
}
