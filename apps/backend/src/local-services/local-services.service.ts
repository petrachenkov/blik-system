import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SaveLocalServiceDto } from './local-service.dto.js';

export function validateServiceImage(data: string | null | undefined): string {
  const match = data?.match(/^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw new BadRequestException('Загрузите картинку PNG, JPEG, WebP или GIF');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 512 * 1024 || bytes.length < 12 || bytes.toString('base64') !== match[2]) {
    throw new BadRequestException('Картинка должна быть не больше 512 КБ');
  }
  const valid = match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : match[1] === 'gif' ? /^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6))
    : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) throw new BadRequestException('Содержимое картинки не соответствует формату');
  return data!;
}

@Injectable()
export class LocalServicesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(includeInactive: boolean) {
    return this.prisma.localService.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }] });
  }

  private data(dto: SaveLocalServiceDto) {
    const url = new URL(dto.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new BadRequestException('Укажите HTTP(S)-ссылку без логина и пароля');
    const emoji = dto.emoji?.trim() || '🔗';
    return { name: dto.name.trim(), description: dto.description?.trim() ?? '', url: dto.url.trim(), iconType: dto.iconType,
      emoji, imageData: dto.iconType === 'image' ? validateServiceImage(dto.imageData) : null, sortOrder: dto.sortOrder, isActive: dto.isActive };
  }

  create(dto: SaveLocalServiceDto) { return this.prisma.localService.create({ data: this.data(dto) }); }

  private async require(id: string) {
    if (!await this.prisma.localService.findUnique({ where: { id } })) throw new NotFoundException('Сервис не найден');
  }

  async update(id: string, dto: SaveLocalServiceDto) {
    await this.require(id);
    return this.prisma.localService.update({ where: { id }, data: this.data(dto) });
  }

  async setVisibility(id: string, isActive: boolean) {
    await this.require(id);
    return this.prisma.localService.update({ where: { id }, data: { isActive } });
  }

  async remove(id: string) { await this.require(id); await this.prisma.localService.delete({ where: { id } }); }
}
