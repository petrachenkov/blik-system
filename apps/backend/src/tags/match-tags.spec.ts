import { describe, expect, it } from 'vitest';
import { matchTagIds, type TagWithKeywords } from './match-tags.js';

const net: TagWithKeywords = {
  id: 'net',
  isActive: true,
  rules: [{ keyword: 'wi-fi' }, { keyword: 'вайфай' }, { keyword: 'интернет' }],
};
const printer: TagWithKeywords = {
  id: 'printer',
  isActive: true,
  rules: [{ keyword: 'принтер' }, { keyword: 'картридж' }],
};

describe('matchTagIds', () => {
  it('находит тег по подстроке без учёта регистра', () => {
    expect(matchTagIds('У меня не работает ВАЙФАЙ в кабинете', [net, printer])).toEqual(['net']);
    expect(matchTagIds('Wi-Fi пропал', [net])).toEqual(['net']);
  });

  it('может проставить несколько тегов сразу', () => {
    expect(matchTagIds('нет интернета и принтер не печатает', [net, printer]).sort()).toEqual(['net', 'printer']);
  });

  it('ничего не находит, если совпадений нет', () => {
    expect(matchTagIds('сломался стул', [net, printer])).toEqual([]);
  });

  it('игнорирует неактивные теги', () => {
    expect(matchTagIds('нет вайфай', [{ ...net, isActive: false }])).toEqual([]);
  });

  it('игнорирует пустые ключевые слова', () => {
    expect(matchTagIds('любой текст', [{ id: 'x', isActive: true, rules: [{ keyword: '' }] }])).toEqual([]);
  });
});
