import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateLocationDto } from './dto/create-location.dto.js';
import type { UpdateLocationDto } from './dto/update-location.dto.js';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(includeInactive = false) {
    return this.prisma.location.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ building: 'asc' }, { room: 'asc' }],
    });
  }

  async create(dto: CreateLocationDto) {
    const existing = await this.prisma.location.findUnique({
      where: { building_room: { building: dto.building, room: dto.room } },
    });
    if (existing) {
      throw new ConflictException('Такое помещение уже добавлено');
    }
    return this.prisma.location.create({ data: dto });
  }

  async update(id: string, dto: UpdateLocationDto) {
    const location = await this.prisma.location.findUnique({ where: { id } });
    if (!location) throw new NotFoundException('Локация не найдена');

    return this.prisma.location.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<void> {
    const location = await this.prisma.location.findUnique({ where: { id } });
    if (!location) throw new NotFoundException('Локация не найдена');

    const usageCount = await this.prisma.ticket.count({ where: { locationId: id } });
    if (usageCount > 0) {
      throw new ConflictException(
        `Нельзя удалить локацию — она используется в ${usageCount} заявке(ах). Деактивируйте её вместо удаления.`,
      );
    }

    await this.prisma.location.delete({ where: { id } });
  }
}
