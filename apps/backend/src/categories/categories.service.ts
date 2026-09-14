import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { slugify } from '../common/utils/slugify.js';
import type { CreateCategoryDto } from './dto/create-category.dto.js';
import type { UpdateCategoryDto } from './dto/update-category.dto.js';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(includeInactive = false) {
    return this.prisma.category.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateCategoryDto) {
    const slug = slugify(dto.name);
    const existing = await this.prisma.category.findUnique({ where: { slug } });
    if (existing) {
      throw new ConflictException('Категория с таким названием уже существует');
    }
    return this.prisma.category.create({ data: { name: dto.name, slug } });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Категория не найдена');

    return this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.name ? slugify(dto.name) : undefined,
        isActive: dto.isActive,
      },
    });
  }

  async remove(id: string): Promise<void> {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Категория не найдена');

    const usageCount = await this.prisma.ticket.count({ where: { categoryId: id } });
    if (usageCount > 0) {
      throw new ConflictException(
        `Нельзя удалить категорию — она используется в ${usageCount} заявке(ах). Деактивируйте её вместо удаления.`,
      );
    }

    await this.prisma.category.delete({ where: { id } });
  }
}
