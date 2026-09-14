import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UserRole } from '../../../generated/prisma/index.js';
import { TICKET_EVENTS, type TicketCommentedEvent } from '../../notifications/events/ticket-events.js';

const COMMENT_INCLUDE = {
  author: { select: { id: true, fullName: true, role: true } },
  attachments: true,
  knowledgeArticles: { select: { id: true, title: true } },
  mentions: { select: { id: true, fullName: true } },
} as const;

const STAFF_ROLES = [UserRole.ADMIN, UserRole.INTERN] as const;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(params: {
    ticketId: string;
    authorId: string;
    body: string;
    knowledgeArticleIds?: string[];
    isInternal?: boolean;
    mentionedUserIds?: string[];
  }) {
    const articleIds = params.knowledgeArticleIds ?? [];
    if (articleIds.length > 0) {
      const foundCount = await this.prisma.knowledgeArticle.count({ where: { id: { in: articleIds } } });
      if (foundCount !== articleIds.length) {
        throw new BadRequestException('Одна или несколько статей базы знаний не найдены');
      }
    }

    // Некорректные/неактивные/не-сотрудники в mentionedUserIds тихо отбрасываются, а не
    // отклоняют весь запрос — @упоминание не должно ронять отправку комментария (см. план).
    const requestedMentionIds = [...new Set(params.mentionedUserIds ?? [])];
    const validMentions =
      requestedMentionIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: requestedMentionIds }, isActive: true, role: { in: [...STAFF_ROLES] } },
            select: { id: true },
          })
        : [];
    const mentionIds = validMentions.map((u) => u.id);

    const comment = await this.prisma.ticketComment.create({
      data: {
        ticketId: params.ticketId,
        authorId: params.authorId,
        body: params.body,
        isInternal: params.isInternal ?? false,
        ...(articleIds.length > 0 ? { knowledgeArticles: { connect: articleIds.map((id) => ({ id })) } } : {}),
        ...(mentionIds.length > 0 ? { mentions: { connect: mentionIds.map((id) => ({ id })) } } : {}),
      },
    });

    const event: TicketCommentedEvent = {
      ticketId: params.ticketId,
      actorId: params.authorId,
      commentId: comment.id,
      isInternal: params.isInternal ?? false,
      mentionedUserIds: mentionIds,
    };
    this.eventEmitter.emit(TICKET_EVENTS.COMMENTED, event);

    return comment;
  }

  /**
   * viewerRole не передан (например, служебные вызовы) — считаем сотрудником техподдержки,
   * т.е. ничего не фильтруем; преподавателю (USER) внутренние заметки не возвращаются
   * (см. план "Внутренние заметки" — тот же приём, что TicketHistoryService.findByTicket).
   */
  findByTicket(ticketId: string, viewerRole?: UserRole) {
    return this.prisma.ticketComment.findMany({
      where: { ticketId, ...(viewerRole === UserRole.USER ? { isInternal: false } : {}) },
      orderBy: { createdAt: 'asc' },
      include: COMMENT_INCLUDE,
    });
  }

  /** Авторизация (свой/чужой/системный/удалённый) — на уровне TicketPolicy.canEditComment,
   * проверяется в контроллере до вызова findOneOrThrow/update/softDelete. */
  async findOneOrThrow(commentId: string) {
    const comment = await this.prisma.ticketComment.findUnique({ where: { id: commentId }, include: COMMENT_INCLUDE });
    if (!comment) throw new NotFoundException('Комментарий не найден');
    return comment;
  }

  /** editedAt проставляется, чтобы фронт показал "(изменено)" (см. план "Правки комментариев"). */
  update(commentId: string, body: string) {
    return this.prisma.ticketComment.update({
      where: { id: commentId },
      data: { body, editedAt: new Date() },
      include: COMMENT_INCLUDE,
    });
  }

  /**
   * Мягкое удаление — текст остаётся в БД (аудит-культура проекта), фронт при deletedAt
   * рендерит только плейсхолдер "Комментарий удалён" (см. план).
   */
  softDelete(commentId: string) {
    return this.prisma.ticketComment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
  }
}
