import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CartridgeRequestStatus, UserRole } from '../../generated/prisma/index.js';
import { generateUniqueCartridgeCode } from './cartridge-code.util.js';
import { buildCartridgeLabelWorkbook } from './cartridge-label-excel.builder.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import type { CreateCartridgeRequestDto } from './dto/create-cartridge-request.dto.js';
import type { FindCartridgesQueryDto } from './dto/find-cartridges-query.dto.js';

const CARTRIDGE_INCLUDE = {
  location: true,
  createdBy: { select: { id: true, fullName: true, username: true } },
  collectedBy: { select: { id: true, fullName: true, username: true } },
  arrivedBy: { select: { id: true, fullName: true, username: true } },
  report: { select: { id: true, number: true } },
} as const;

@Injectable()
export class CartridgesService {
  constructor(private readonly prisma: PrismaService) {}

  private async generateNumber(): Promise<string> {
    const [{ nextval }] = await this.prisma.$queryRaw<{ nextval: bigint }[]>`
      SELECT nextval('cartridge_request_number_seq')
    `;
    return `CART-${nextval.toString().padStart(6, '0')}`;
  }

  /** Видимость: преподаватель видит только свои заявки, все остальные роли — все заявки. */
  private buildVisibilityWhere(user: AuthenticatedUser) {
    return user.role === UserRole.USER ? { createdById: user.id } : {};
  }

  async create(user: AuthenticatedUser, dto: CreateCartridgeRequestDto) {
    const location = await this.prisma.location.findUnique({ where: { id: dto.locationId } });
    if (!location || !location.isActive) {
      throw new BadRequestException('Указанная локация не найдена');
    }

    const [number, code] = await Promise.all([this.generateNumber(), generateUniqueCartridgeCode(this.prisma)]);

    return this.prisma.cartridgeRequest.create({
      data: {
        number,
        code,
        locationId: dto.locationId,
        createdById: user.id,
        status: CartridgeRequestStatus.NEW,
      },
      include: CARTRIDGE_INCLUDE,
    });
  }

  async findAll(user: AuthenticatedUser, query: FindCartridgesQueryDto) {
    const where = {
      ...this.buildVisibilityWhere(user),
      // Без явного статуса показываем только активную очередь — заправленные картриджи
      // загромождали бы список для исполнителей (см. фидбэк); их место — отдельный архив
      // (см. CartridgeArchivePage на фронтенде), а тут их можно найти только явным фильтром.
      ...(query.status ? { status: query.status } : { status: { not: CartridgeRequestStatus.FILLED } }),
    };

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const [items, total] = await this.prisma.$transaction([
      this.prisma.cartridgeRequest.findMany({
        where,
        include: CARTRIDGE_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.cartridgeRequest.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOneOrThrow(id: string) {
    const request = await this.prisma.cartridgeRequest.findUnique({ where: { id }, include: CARTRIDGE_INCLUDE });
    if (!request) throw new NotFoundException('Заявка на заправку не найдена');
    return request;
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const request = await this.findOneOrThrow(id);
    if (user.role === UserRole.USER && request.createdById !== user.id) {
      throw new ForbiddenException('Нет доступа к этой заявке');
    }
    return request;
  }

  /** Отметка получения — без формального назначения: любой исполнитель забирает заявку одним кликом. */
  async collect(user: AuthenticatedUser, id: string) {
    const request = await this.findOneOrThrow(id);
    if (request.status !== CartridgeRequestStatus.NEW) {
      throw new BadRequestException('Заявка уже забрана или закрыта');
    }

    return this.prisma.cartridgeRequest.update({
      where: { id },
      data: { status: CartridgeRequestStatus.COLLECTED, collectedById: user.id, collectedAt: new Date() },
      include: CARTRIDGE_INCLUDE,
    });
  }

  /**
   * Excel-файл этикеток для выбранных заявок (см. план "Печать этикеток картриджей") —
   * Label Expert подключает его как "базу данных" (сам он строки для печати не выбирает,
   * поэтому выбор — здесь, галочками в Blik; изначально была отдельная persistent-очередь
   * с полем `labelQueuedAt`, но по фидбэку упростили до одного шага: выделил → скачал —
   * без промежуточного состояния "стоит в очереди", которое нужно было отдельно снимать).
   * Печатать можно только заявки в статусе NEW — не найденные/чужого статуса id молча
   * игнорируются, а не считаются ошибкой (тот же идемпотентный стиль, что был у постановки
   * в очередь).
   */
  async exportLabels(ids: string[]): Promise<Buffer> {
    const requests = await this.prisma.cartridgeRequest.findMany({
      where: { id: { in: ids }, status: CartridgeRequestStatus.NEW },
      include: { location: true, createdBy: { select: { fullName: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return buildCartridgeLabelWorkbook(
      requests.map((r) => ({
        number: r.number,
        code: r.code,
        room: `${r.location.building}, каб. ${r.location.room}`,
        teacherFullName: r.createdBy.fullName,
        createdAt: r.createdAt,
      })),
    );
  }

  /**
   * Сканирование QR на этикетке при физическом возврате картриджа с заправки (см. план,
   * часть B) — заявка должна быть в статусе SENT (включена в сформированный отчёт, ещё не
   * закрыт). `code` уникален среди активных статусов (см. cartridge-code.util.ts), поэтому
   * однозначно определяет заявку и на этом этапе её жизненного цикла.
   */
  async scanArrival(user: AuthenticatedUser, code: string) {
    const request = await this.prisma.cartridgeRequest.findFirst({
      where: { code, status: CartridgeRequestStatus.SENT },
      include: CARTRIDGE_INCLUDE,
    });
    if (!request) {
      throw new NotFoundException('Нет отправленной на заправку заявки с таким кодом');
    }
    if (request.arrivedAt) {
      throw new BadRequestException('Эта заявка уже отмечена как прибывшая');
    }

    return this.prisma.cartridgeRequest.update({
      where: { id: request.id },
      data: { arrivedAt: new Date(), arrivedById: user.id },
      include: CARTRIDGE_INCLUDE,
    });
  }

  async cancel(user: AuthenticatedUser, id: string) {
    const request = await this.findOneOrThrow(id);
    if (request.createdById !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Отменить заявку может только её автор или сисадмин');
    }
    if (request.status !== CartridgeRequestStatus.NEW) {
      throw new BadRequestException('Отменить можно только заявку, которую ещё не забрали');
    }

    return this.prisma.cartridgeRequest.update({
      where: { id },
      data: { status: CartridgeRequestStatus.CANCELLED, cancelledAt: new Date() },
      include: CARTRIDGE_INCLUDE,
    });
  }
}
