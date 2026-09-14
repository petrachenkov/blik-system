import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../storage/storage.interface.js';
import type { UploadedFileLike } from '../tickets/attachments/attachments.service.js';
import { AttachmentsService } from '../tickets/attachments/attachments.service.js';

/**
 * Файлы/скриншоты в статье БЗ (см. план) — копия TicketsService.attachments, но без
 * commentId/истории (у статьи нет чата и аудит-лога). Валидацию MIME/размера переиспользуем
 * из AttachmentsService (assertFileAllowed), а не дублируем.
 */
@Injectable()
export class KnowledgeAttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly ticketAttachments: AttachmentsService,
  ) {}

  async saveOne(params: { articleId: string; uploadedById: string; file: UploadedFileLike }) {
    this.ticketAttachments.assertFileAllowed(params.file);
    const { storedPath } = await this.storage.save(params.file.buffer, params.file.originalname);

    return this.prisma.knowledgeArticleAttachment.create({
      data: {
        articleId: params.articleId,
        uploadedById: params.uploadedById,
        filename: params.file.originalname,
        storedPath,
        mimeType: params.file.mimetype,
        sizeBytes: params.file.size,
      },
    });
  }

  findByArticle(articleId: string) {
    return this.prisma.knowledgeArticleAttachment.findMany({
      where: { articleId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getForDownload(articleId: string, attachmentId: string) {
    const attachment = await this.prisma.knowledgeArticleAttachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.articleId !== articleId) {
      throw new NotFoundException('Файл не найден');
    }
    return { attachment, absolutePath: this.storage.getAbsolutePath(attachment.storedPath) };
  }

  async remove(articleId: string, attachmentId: string): Promise<void> {
    const { attachment } = await this.getForDownload(articleId, attachmentId);
    await this.prisma.knowledgeArticleAttachment.delete({ where: { id: attachmentId } });
    await this.storage.delete(attachment.storedPath);
  }
}
