import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { UserRole } from '../../generated/prisma/index.js';
import type { UploadedFileLike } from '../tickets/attachments/attachments.service.js';
import { FeatureFlagsService } from '../system/feature-flags.service.js';
import { FEATURE_FLAGS } from '../system/feature-flags.js';
import { KnowledgeService } from './knowledge.service.js';
import { KnowledgeAttachmentsService } from './knowledge-attachments.service.js';
import { CreateKnowledgeArticleDto } from './dto/create-knowledge-article.dto.js';
import { UpdateKnowledgeArticleDto } from './dto/update-knowledge-article.dto.js';

const MULTER_OPTIONS = { storage: memoryStorage() };

/** Кто ведёт базу знаний — те же роли, что реально решают заявки (см. план). Удаление —
 * только Главному сисадмину, по общей конвенции с категориями/локациями. */
const MAINTAINER_ROLES = [UserRole.ADMIN, UserRole.INTERN] as const;

@ApiTags('knowledge')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('knowledge-articles')
export class KnowledgeController {
  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly attachmentsService: KnowledgeAttachmentsService,
    private readonly flags: FeatureFlagsService,
  ) {}

  /** Чтение открыто всем аутентифицированным — в том числе преподавателю, если статья
   * прикреплена к ответу на его же заявку (см. план: ссылка из чата заявки). */
  @Get()
  findAll(@Query('search') search?: string, @Query('categoryId') categoryId?: string, @Query('take') take?: string) {
    return this.knowledgeService.findAll({ search, categoryId, take: take ? Number(take) : undefined });
  }

  /** Подсказка при создании заявки по свободному тексту описания — до :id, иначе Nest примет
   * "suggest" за id статьи (см. план "Авто-подсказка статьи БЗ"). */
  @Get('suggest')
  async suggest(@Query('text') text: string) {
    if (!(await this.flags.isEnabled(FEATURE_FLAGS.KB_SUGGESTIONS))) return [];
    return this.knowledgeService.suggest(text ?? '');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.knowledgeService.findOne(id);
  }

  @Post()
  @Roles(...MAINTAINER_ROLES)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateKnowledgeArticleDto) {
    return this.knowledgeService.create(user.id, dto);
  }

  @Patch(':id')
  @Roles(...MAINTAINER_ROLES)
  update(@Param('id') id: string, @Body() dto: UpdateKnowledgeArticleDto) {
    return this.knowledgeService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.knowledgeService.remove(id);
  }

  // --- Файлы/скриншоты статьи (см. план "Файлы/скриншоты в статьях БЗ") ---

  @Get(':id/attachments')
  getAttachments(@Param('id') id: string) {
    return this.attachmentsService.findByArticle(id);
  }

  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', MULTER_OPTIONS))
  @Post(':id/attachments')
  @Roles(...MAINTAINER_ROLES)
  uploadAttachment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @UploadedFile() file: UploadedFileLike) {
    if (!file) throw new NotFoundException('Файл не передан');
    return this.attachmentsService.saveOne({ articleId: id, uploadedById: user.id, file });
  }

  @Get(':id/attachments/:attachmentId')
  async downloadAttachment(@Param('id') id: string, @Param('attachmentId') attachmentId: string, @Res() res: Response) {
    const { attachment, absolutePath } = await this.attachmentsService.getForDownload(id, attachmentId);
    res.download(absolutePath, attachment.filename);
  }

  @Delete(':id/attachments/:attachmentId')
  @Roles(...MAINTAINER_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAttachment(@Param('id') id: string, @Param('attachmentId') attachmentId: string) {
    return this.attachmentsService.remove(id, attachmentId);
  }
}
