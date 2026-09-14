import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../storage/storage.interface.js';
import type { CreateKnowledgeArticleDto } from './dto/create-knowledge-article.dto.js';
import type { UpdateKnowledgeArticleDto } from './dto/update-knowledge-article.dto.js';

const SUMMARY_SELECT = {
  id: true,
  title: true,
  content: true,
  categoryId: true,
  category: { select: { id: true, name: true } },
  createdBy: { select: { id: true, fullName: true } },
  createdAt: true,
  updatedAt: true,
  _count: { select: { usedInComments: true } },
} as const;

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  findAll(params: { search?: string; categoryId?: string; take?: number }) {
    return this.prisma.knowledgeArticle.findMany({
      where: {
        categoryId: params.categoryId || undefined,
        ...(params.search
          ? {
              OR: [
                { title: { contains: params.search, mode: 'insensitive' } },
                { content: { contains: params.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: params.take,
      select: SUMMARY_SELECT,
    });
  }

  /**
   * Подсказка статьи при создании заявки (см. план "Авто-подсказка статьи БЗ") — принципиально
   * не то же самое, что findAll(search): там ищущий сам формулирует короткий запрос, и совпадение
   * его целиком как подстроки — нормально. Здесь source — свободный текст описания проблемы
   * ("У меня принтер жуёт бумагу, помогите..."), который почти никогда не совпадёт целиком ни
   * с одной статьёй; вместо этого разбиваем на значимые слова и ищем статьи, где есть ХОТЯ БЫ
   * одно из них.
   *
   * Раньше это делалось через `contains` по каждому слову буквально — и почти никогда не
   * срабатывало на реальном тексте: русский язык сильно склоняется ("шины" в описании не
   * совпадает как подстрока со статьёй про "шина"), так что обычная фраза почти никогда не
   * даёт буквального совпадения (см. фидбэк "подсказка перестала работать" — на самом деле
   * никогда толком не работала). Вместо самодельного стемминга используем полнотекстовый
   * поиск Postgres со встроенным русским словарём (`to_tsvector('russian', ...)` —
   * не требует расширений вроде pg_trgm, есть в любом Postgres из коробки) — он сам приводит
   * слова к основе с обеих сторон. Слова по-прежнему соединяются через "|" (ИЛИ), а не "&" —
   * иначе полнотекстовый поиск потребовал бы присутствия сразу всех слов запроса.
   */
  async suggest(text: string, take = 5) {
    const words = [...new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4))].slice(0, 8);
    if (words.length === 0) return [];

    const tsQuery = words.join(' | ');

    const ranked = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM "KnowledgeArticle"
      WHERE to_tsvector('russian', title || ' ' || content) @@ to_tsquery('russian', ${tsQuery})
      ORDER BY ts_rank(to_tsvector('russian', title || ' ' || content), to_tsquery('russian', ${tsQuery})) DESC
      LIMIT ${take}
    `;
    if (ranked.length === 0) return [];

    const articles = await this.prisma.knowledgeArticle.findMany({
      where: { id: { in: ranked.map((r) => r.id) } },
      select: SUMMARY_SELECT,
    });

    // findMany не гарантирует порядок по списку id — сортируем обратно по рангу полнотекстового поиска.
    const rankOrder = new Map(ranked.map((r, index) => [r.id, index]));
    return articles.sort((a, b) => (rankOrder.get(a.id) ?? 0) - (rankOrder.get(b.id) ?? 0));
  }

  async findOne(id: string) {
    const article = await this.prisma.knowledgeArticle.findUnique({ where: { id }, select: SUMMARY_SELECT });
    if (!article) throw new NotFoundException('Статья не найдена');

    // "Примеры заявок" — не отдельные данные, а сами заявки, к чьим ответам была
    // прикреплена эта статья (см. план). Один и тот же тикет не задублируется, даже
    // если статью прикрепляли к нескольким его комментариям — фильтр на Ticket, не на Comment.
    const exampleTickets = await this.prisma.ticket.findMany({
      where: { comments: { some: { knowledgeArticles: { some: { id } } } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        number: true,
        description: true,
        status: true,
        createdAt: true,
        location: { select: { building: true, room: true, label: true } },
      },
    });

    return { ...article, exampleTickets };
  }

  async create(createdById: string, dto: CreateKnowledgeArticleDto) {
    return this.prisma.knowledgeArticle.create({
      data: {
        title: dto.title,
        content: dto.content,
        categoryId: dto.categoryId || null,
        createdById,
      },
      select: SUMMARY_SELECT,
    });
  }

  async update(id: string, dto: UpdateKnowledgeArticleDto) {
    const existing = await this.prisma.knowledgeArticle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Статья не найдена');

    return this.prisma.knowledgeArticle.update({
      where: { id },
      data: {
        title: dto.title,
        content: dto.content,
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId || null } : {}),
      },
      select: SUMMARY_SELECT,
    });
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.knowledgeArticle.findUnique({
      where: { id },
      include: { attachments: true },
    });
    if (!existing) throw new NotFoundException('Статья не найдена');

    // Строки KnowledgeArticleAttachment удалятся каскадом на уровне БД (onDelete: Cascade
    // в схеме), но сами файлы на диске каскад не тронет — чистим их отдельно, как и при
    // удалении заявки (см. TicketsService.remove).
    await this.prisma.knowledgeArticle.delete({ where: { id } });
    for (const attachment of existing.attachments) {
      await this.storage.delete(attachment.storedPath);
    }
  }
}
