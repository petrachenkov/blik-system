import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SnippetKind } from '../../generated/prisma/index.js';
import type { CreateTextSnippetDto } from './dto/create-text-snippet.dto.js';
import type { UpdateTextSnippetDto } from './dto/update-text-snippet.dto.js';

@Injectable()
export class TextSnippetsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(kind?: SnippetKind, includeInactive = false) {
    return this.prisma.textSnippet.findMany({
      where: {
        ...(kind ? { kind } : {}),
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  create(dto: CreateTextSnippetDto) {
    return this.prisma.textSnippet.create({
      data: { kind: dto.kind, title: dto.title, body: dto.body },
    });
  }

  async update(id: string, dto: UpdateTextSnippetDto) {
    const snippet = await this.prisma.textSnippet.findUnique({ where: { id } });
    if (!snippet) throw new NotFoundException('Шаблон не найден');

    return this.prisma.textSnippet.update({
      where: { id },
      data: {
        title: dto.title,
        body: dto.body,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
      },
    });
  }

  async remove(id: string): Promise<void> {
    const snippet = await this.prisma.textSnippet.findUnique({ where: { id } });
    if (!snippet) throw new NotFoundException('Шаблон не найден');

    await this.prisma.textSnippet.delete({ where: { id } });
  }
}
