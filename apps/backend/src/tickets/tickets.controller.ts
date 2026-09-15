import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { StaffOnlyGuard } from '../common/guards/staff-only.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { UserRole } from '../../generated/prisma/index.js';
import { TicketsService } from './tickets.service.js';
import { TicketPolicy } from './policies/ticket-policy.js';
import { CommentsService } from './comments/comments.service.js';
import { AttachmentsService, type UploadedFileLike } from './attachments/attachments.service.js';
import { TicketHistoryService } from './history/ticket-history.service.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { AssignTicketDto } from './dto/assign-ticket.dto.js';
import { ClassifyTicketDto } from './dto/classify-ticket.dto.js';
import { ChangeStatusDto } from './dto/change-status.dto.js';
import { FindTicketsQueryDto } from './dto/find-tickets-query.dto.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { UpdateCommentDto } from './dto/update-comment.dto.js';
import { RateTicketDto } from './dto/rate-ticket.dto.js';
import { SetTagsDto } from './dto/set-tags.dto.js';
import { AddCollaboratorDto, BulkTicketActionDto, SetArchivedDto } from './dto/bulk-ticket-action.dto.js';
import { StatsPeriodQueryDto } from './dto/stats-period-query.dto.js';
import { buildMyTicketsReportPdf, buildSingleTicketPdf } from './ticket-report-pdf.builder.js';
import { buildAssigneeStatsWorkbook } from './assignee-stats-report.builder.js';

const MULTER_OPTIONS = { storage: memoryStorage() };

@ApiTags('tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly policy: TicketPolicy,
    private readonly commentsService: CommentsService,
    private readonly attachmentsService: AttachmentsService,
    private readonly historyService: TicketHistoryService,
  ) {}

  @UseGuards(StaffOnlyGuard)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTicketDto) {
    return this.ticketsService.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: FindTicketsQueryDto) {
    return this.ticketsService.findAll(user, query);
  }

  /** Статистика по исполнителям — до :id, иначе Nest примет "stats" за id заявки. */
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('stats/by-assignee')
  getAssigneeStats(@Query() query: StatsPeriodQueryDto) {
    return this.ticketsService.getAssigneeStats(
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
    );
  }

  /** Та же статистика документом (см. план "Отчёт по статистике за период") — до :id. */
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('stats/by-assignee/export')
  async exportAssigneeStats(@Query() query: StatsPeriodQueryDto, @Res() res: Response) {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    const rows = await this.ticketsService.getAssigneeStats(from ?? undefined, to ?? undefined);
    const buffer = await buildAssigneeStatsWorkbook({ generatedAt: new Date(), from, to, rows });
    const suffix = from && to ? `${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}` : 'vse-vremya';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="statistika_${suffix}.xlsx"`);
    res.send(buffer);
  }

  /** Экран «Мой день» — только сотрудники техподдержки (см. план №31). Литеральный путь до :id. */
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERN)
  @Get('my-day')
  getMyDay(@CurrentUser() user: AuthenticatedUser) {
    return this.ticketsService.getMyDay(user);
  }

  /** Массовые операции над заявками (см. план). Литеральный путь до :id. */
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERN)
  @Patch('bulk')
  bulkAction(@CurrentUser() user: AuthenticatedUser, @Body() dto: BulkTicketActionDto) {
    return this.ticketsService.bulkAction(user, dto);
  }

  /** PDF-справка о собственных заявках преподавателя — с хронологией и чатом по каждой. */
  @Get('report/mine')
  async downloadMyReport(@CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    const { teacherFullName, tickets } = await this.ticketsService.findMyTicketsForReport(user.id, user.role);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="spravka.pdf"');
    const doc = buildMyTicketsReportPdf({ teacherFullName, generatedAt: new Date(), tickets });
    doc.pipe(res);
    doc.end();
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ticketsService.findOne(user, id);
  }

  @Patch(':id/assign')
  assign(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: AssignTicketDto) {
    return this.ticketsService.assign(user, id, dto);
  }

  @Patch(':id/classify')
  classify(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ClassifyTicketDto) {
    return this.ticketsService.classify(user, id, dto);
  }

  @Patch(':id/status')
  changeStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ChangeStatusDto) {
    return this.ticketsService.changeStatus(user, id, dto);
  }

  /** Оценка качества решения заявителем — только после закрытия заявки (см. план). */
  @Patch(':id/rate')
  rate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RateTicketDto) {
    return this.ticketsService.rate(user, id, dto);
  }

  /** Ручная установка тегов заявки — только сотрудники техподдержки (см. план "Авто-тегирование"). */
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERN)
  @Put(':id/tags')
  setTags(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SetTagsDto) {
    return this.ticketsService.setTags(user, id, dto.tagIds);
  }

  /** Пометить/снять архив заявки (см. план "Архив заявок") — только сисадмин. */
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/archive')
  setArchived(@Param('id') id: string, @Body() dto: SetArchivedDto) {
    return this.ticketsService.setArchived(id, dto.archived);
  }

  /** Соисполнители заявки (см. план) — сисадмин или назначенный исполнитель. */
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERN)
  @Post(':id/collaborators')
  addCollaborator(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: AddCollaboratorDto) {
    return this.ticketsService.addCollaborator(user, id, dto.userId);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERN)
  @Delete(':id/collaborators/:userId')
  removeCollaborator(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.ticketsService.removeCollaborator(user, id, userId);
  }

  /** Безвозвратное удаление заявки — доступно сисадминам (по решению пользователя). */
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.ticketsService.remove(id);
  }

  @Get(':id/history')
  async getHistory(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.ticketsService.findOne(user, id); // проверка видимости
    return this.historyService.findByTicket(id, user.role);
  }

  /** PDF-справка по одной конкретной заявке — доступна всем, кто видит заявку (см. план). */
  @Get(':id/report')
  async downloadTicketReport(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res() res: Response) {
    await this.ticketsService.findOne(user, id); // проверка видимости
    const { ticket, teacherFullName } = await this.ticketsService.findTicketForReport(id, user.role);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${ticket.number}.pdf"`);
    const doc = buildSingleTicketPdf({ teacherFullName, generatedAt: new Date(), ticket });
    doc.pipe(res);
    doc.end();
  }

  // --- Комментарии (чат по заявке) ---

  @Get(':id/comments')
  async getComments(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.ticketsService.findOne(user, id);
    return this.commentsService.findByTicket(id, user.role);
  }

  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 10, MULTER_OPTIONS))
  @Post(':id/comments')
  async createComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
    @UploadedFiles() files: UploadedFileLike[] = [],
  ) {
    const ticket = await this.ticketsService.findOneOrThrow(id);
    if (!this.policy.canComment(user, ticket)) {
      throw new ForbiddenException('Комментировать эту заявку может только заявитель, исполнитель или сисадмин');
    }
    // Прикреплять статьи базы знаний к ответу может только сотрудник техподдержки —
    // для заявителя, комментирующего собственную заявку, это поле игнорируется/запрещено.
    if (dto.knowledgeArticleIds?.length && user.role === UserRole.USER) {
      throw new ForbiddenException('Прикреплять статьи базы знаний может только сотрудник техподдержки');
    }
    // Внутреннюю заметку (не видна заявителю) может оставить только сотрудник техподдержки.
    if (dto.isInternal && user.role === UserRole.USER) {
      throw new ForbiddenException('Оставлять внутренние заметки может только сотрудник техподдержки');
    }
    // @Упоминания — только между сотрудниками (см. план "Упоминания"); заявитель их не видит.
    if (dto.mentionedUserIds?.length && user.role === UserRole.USER) {
      throw new ForbiddenException('Упоминать коллег может только сотрудник техподдержки');
    }

    const comment = await this.commentsService.create({
      ticketId: id,
      authorId: user.id,
      body: dto.body,
      knowledgeArticleIds: dto.knowledgeArticleIds,
      isInternal: dto.isInternal,
      mentionedUserIds: dto.mentionedUserIds,
    });

    for (const file of files) {
      await this.attachmentsService.saveOne({
        ticketId: id,
        commentId: comment.id,
        uploadedById: user.id,
        file,
      });
    }

    return this.commentsService
      .findByTicket(id, user.role)
      .then((comments) => comments.find((c) => c.id === comment.id));
  }

  /** Редактировать свой комментарий — без ограничения по времени (см. план). */
  @Patch(':id/comments/:commentId')
  async updateComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
  ) {
    const comment = await this.commentsService.findOneOrThrow(commentId);
    if (comment.ticketId !== id) throw new NotFoundException('Комментарий не найден');
    if (!this.policy.canEditComment(user, comment)) {
      throw new ForbiddenException('Редактировать можно только свой комментарий');
    }
    return this.commentsService.update(commentId, dto.body);
  }

  /** Удалить свой комментарий — мягко, текст остаётся в истории (см. план). */
  @Delete(':id/comments/:commentId')
  async removeComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('commentId') commentId: string,
  ) {
    const comment = await this.commentsService.findOneOrThrow(commentId);
    if (comment.ticketId !== id) throw new NotFoundException('Комментарий не найден');
    if (!this.policy.canEditComment(user, comment)) {
      throw new ForbiddenException('Удалить можно только свой комментарий');
    }
    return this.commentsService.softDelete(commentId);
  }

  // --- Вложения к самой заявке ---

  @Get(':id/attachments')
  async getAttachments(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.ticketsService.findOne(user, id);
    return this.attachmentsService.findByTicket(id);
  }

  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', MULTER_OPTIONS))
  @Post(':id/attachments')
  async uploadAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: UploadedFileLike,
  ) {
    const ticket = await this.ticketsService.findOneOrThrow(id);
    if (!this.policy.canComment(user, ticket)) {
      throw new ForbiddenException('Нет доступа к этой заявке');
    }
    if (!file) {
      throw new NotFoundException('Файл не передан');
    }

    return this.attachmentsService.saveOne({ ticketId: id, uploadedById: user.id, file });
  }

  @Get(':id/attachments/:attachmentId')
  async downloadAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    await this.ticketsService.findOne(user, id);
    const { attachment, absolutePath } = await this.attachmentsService.getForDownload(id, attachmentId);
    res.download(absolutePath, attachment.filename);
  }
}
