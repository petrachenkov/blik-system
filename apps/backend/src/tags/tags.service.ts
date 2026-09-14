import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AddTagRuleDto, CreateTagDto, UpdateTagDto } from './dto/tag.dto.js';

const TAG_INCLUDE = {
  rules: { orderBy: { createdAt: 'asc' as const } },
  _count: { select: { tickets: true } },
} as const;

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(includeInactive = false) {
    return this.prisma.tag.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
      include: TAG_INCLUDE,
    });
  }

  async create(dto: CreateTagDto) {
    const existing = await this.prisma.tag.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException('Тег с таким названием уже существует');
    return this.prisma.tag.create({
      data: { name: dto.name, color: dto.color ?? null },
      include: TAG_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateTagDto) {
    await this.getOrThrow(id);
    if (dto.name) {
      const clash = await this.prisma.tag.findFirst({ where: { name: dto.name, NOT: { id } } });
      if (clash) throw new ConflictException('Тег с таким названием уже существует');
    }
    return this.prisma.tag.update({
      where: { id },
      data: {
        name: dto.name,
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        isActive: dto.isActive,
      },
      include: TAG_INCLUDE,
    });
  }

  async remove(id: string): Promise<void> {
    await this.getOrThrow(id);
    const usageCount = await this.prisma.ticket.count({ where: { tags: { some: { id } } } });
    if (usageCount > 0) {
      throw new ConflictException(
        `Нельзя удалить тег — он проставлен в ${usageCount} заявке(ах). Деактивируйте его вместо удаления.`,
      );
    }
    await this.prisma.tag.delete({ where: { id } });
  }

  async addRule(tagId: string, dto: AddTagRuleDto) {
    await this.getOrThrow(tagId);
    await this.prisma.tagRule.create({ data: { tagId, keyword: dto.keyword.trim().toLowerCase() } });
    return this.prisma.tag.findUnique({ where: { id: tagId }, include: TAG_INCLUDE });
  }

  async removeRule(tagId: string, ruleId: string) {
    await this.prisma.tagRule.deleteMany({ where: { id: ruleId, tagId } });
    return this.prisma.tag.findUnique({ where: { id: tagId }, include: TAG_INCLUDE });
  }

  private async getOrThrow(id: string) {
    const tag = await this.prisma.tag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundException('Тег не найден');
    return tag;
  }
}
