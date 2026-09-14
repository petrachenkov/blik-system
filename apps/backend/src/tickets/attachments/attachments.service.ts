import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../../storage/storage.interface.js';
import { ALLOWED_MIME_TYPES, isVideoMimeType } from '../../storage/allowed-mime-types.js';
import { HistoryAction } from '../../../generated/prisma/index.js';
import { TicketHistoryService } from '../history/ticket-history.service.js';
import type { Env } from '../../config/env.schema.js';

export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly history: TicketHistoryService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Валидирует MIME-тип и размер (для видео — отдельный, более высокий лимит). Бросает исключение. */
  assertFileAllowed(file: UploadedFileLike): void {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`Недопустимый тип файла: ${file.mimetype}`);
    }
    const limitMb = isVideoMimeType(file.mimetype)
      ? this.config.get('MAX_VIDEO_UPLOAD_SIZE_MB', { infer: true })
      : this.config.get('MAX_UPLOAD_SIZE_MB', { infer: true });
    if (file.size > limitMb * 1024 * 1024) {
      throw new BadRequestException(`Файл превышает допустимый размер (${limitMb} МБ)`);
    }
  }

  async saveOne(params: {
    ticketId: string;
    commentId?: string;
    uploadedById: string;
    file: UploadedFileLike;
  }) {
    this.assertFileAllowed(params.file);
    const { storedPath } = await this.storage.save(params.file.buffer, params.file.originalname);

    const attachment = await this.prisma.ticketAttachment.create({
      data: {
        ticketId: params.ticketId,
        commentId: params.commentId,
        uploadedById: params.uploadedById,
        filename: params.file.originalname,
        storedPath,
        mimeType: params.file.mimetype,
        sizeBytes: params.file.size,
      },
    });

    if (!params.commentId) {
      await this.history.record({
        ticketId: params.ticketId,
        actorId: params.uploadedById,
        action: HistoryAction.ATTACHMENT_ADDED,
        toValue: params.file.originalname,
      });
    }

    return attachment;
  }

  findByTicket(ticketId: string) {
    return this.prisma.ticketAttachment.findMany({
      where: { ticketId, commentId: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getForDownload(ticketId: string, attachmentId: string) {
    const attachment = await this.prisma.ticketAttachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.ticketId !== ticketId) {
      throw new NotFoundException('Файл не найден');
    }
    return { attachment, absolutePath: this.storage.getAbsolutePath(attachment.storedPath) };
  }
}
