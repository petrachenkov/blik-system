import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service.js';
import { CartridgeReportStatus, CartridgeRequestStatus } from '../../generated/prisma/index.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../storage/storage.interface.js';
import { buildCartridgeReportWorkbook } from './excel-report.builder.js';
import { CARTRIDGE_EVENTS, type CartridgeFilledEvent } from '../notifications/events/cartridge-events.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import type { GenerateCartridgeReportDto } from './dto/generate-report.dto.js';

const REPORT_INCLUDE = {
  createdBy: { select: { id: true, fullName: true, username: true } },
  closedBy: { select: { id: true, fullName: true, username: true } },
  _count: { select: { requests: true } },
} as const;

@Injectable()
export class CartridgeReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  private async generateNumber(): Promise<string> {
    const [{ nextval }] = await this.prisma.$queryRaw<{ nextval: bigint }[]>`
      SELECT nextval('cartridge_report_number_seq')
    `;
    return `REPORT-${nextval.toString().padStart(6, '0')}`;
  }

  findAll() {
    return this.prisma.cartridgeReport.findMany({
      include: REPORT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneOrThrow(id: string) {
    const report = await this.prisma.cartridgeReport.findUnique({ where: { id }, include: REPORT_INCLUDE });
    if (!report) throw new NotFoundException('Отчёт не найден');
    return report;
  }

  async generate(user: AuthenticatedUser, dto: GenerateCartridgeReportDto) {
    const requests = await this.prisma.cartridgeRequest.findMany({
      where: { id: { in: dto.requestIds } },
      include: { location: true, createdBy: { select: { fullName: true } } },
    });

    if (requests.length !== dto.requestIds.length) {
      throw new BadRequestException('Некоторые из указанных заявок не найдены');
    }
    const notCollected = requests.filter((r) => r.status !== CartridgeRequestStatus.COLLECTED);
    if (notCollected.length > 0) {
      throw new BadRequestException('В отчёт можно включить только заявки, которые уже забраны исполнителем (статус "Собран")');
    }

    const number = await this.generateNumber();
    const generatedAt = new Date();

    const buffer = await buildCartridgeReportWorkbook({
      reportNumber: number,
      generatedAt,
      rows: requests.map((r) => ({
        code: r.code,
        room: `${r.location.building}, каб. ${r.location.room}`,
        teacherFullName: r.createdBy.fullName,
      })),
    });

    const filename = `${number}.xlsx`;
    const saved = await this.storage.save(buffer, filename);

    const report = await this.prisma.cartridgeReport.create({
      data: {
        number,
        createdById: user.id,
        filename,
        storedPath: saved.storedPath,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: buffer.byteLength,
      },
    });

    await this.prisma.cartridgeRequest.updateMany({
      where: { id: { in: dto.requestIds } },
      data: { status: CartridgeRequestStatus.SENT, reportId: report.id },
    });

    return this.findOneOrThrow(report.id);
  }

  async getForDownload(id: string) {
    const report = await this.findOneOrThrow(id);
    return { report, absolutePath: this.storage.getAbsolutePath(report.storedPath) };
  }

  /**
   * Закрытие отчёта целиком: картриджи разнесены по кабинетам, заявки, которые входили именно
   * в этот отчёт, переходят в "Заправлен" (см. план — решение пользователя: закрытие постатейно
   * не нужно, действие над отчётом целиком).
   */
  async close(user: AuthenticatedUser, id: string) {
    const report = await this.findOneOrThrow(id);
    if (report.status !== CartridgeReportStatus.GENERATED) {
      throw new BadRequestException('Этот отчёт уже закрыт');
    }

    const requests = await this.prisma.cartridgeRequest.findMany({ where: { reportId: id }, select: { id: true } });
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.cartridgeReport.update({
        where: { id },
        data: { status: CartridgeReportStatus.CLOSED, closedById: user.id, closedAt: now },
      }),
      this.prisma.cartridgeRequest.updateMany({
        where: { reportId: id },
        data: { status: CartridgeRequestStatus.FILLED, filledAt: now },
      }),
    ]);

    for (const request of requests) {
      const event: CartridgeFilledEvent = { cartridgeRequestId: request.id, actorId: user.id };
      this.eventEmitter.emit(CARTRIDGE_EVENTS.FILLED, event);
    }

    return this.findOneOrThrow(id);
  }
}
