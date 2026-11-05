import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { UserRole } from '../../generated/prisma/index.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { SaveLocalServiceDto } from './local-service.dto.js';
import { LocalServicesController } from './local-services.controller.js';
import { LocalServicesService, validateServiceImage } from './local-services.service.js';

const input = { name: 'Библиотека', description: 'Книги', url: 'http://192.168.1.10:8080/books', iconType: 'emoji' as const, emoji: '📚', sortOrder: 1, isActive: true };
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGN8AAAAASUVORK5CYII=';

describe('Local services validation and access', () => {
  it.each(['http://192.168.1.10:8080/books', 'http://localhost:8080', 'https://library.local', 'http://intranet'])('accepts local HTTP(S) URL %s', (url) => {
    expect(validateSync(plainToInstance(SaveLocalServiceDto, { ...input, url }))).toEqual([]);
  });
  it.each(['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,hello', 'library.local'])('rejects unsafe or incomplete URL %s', (url) => {
    expect(validateSync(plainToInstance(SaveLocalServiceDto, { ...input, url })).length).toBeGreaterThan(0);
  });
  it('accepts PNG and rejects SVG, disguised content and oversized image', () => {
    expect(validateServiceImage(image)).toBe(image);
    expect(() => validateServiceImage('data:image/svg+xml;base64,' + Buffer.from('<svg></svg>').toString('base64'))).toThrow();
    expect(() => validateServiceImage('data:image/png;base64,' + Buffer.from('not really an image').toString('base64'))).toThrow();
    expect(() => validateServiceImage('data:image/png;base64,' + Buffer.alloc(512 * 1024 + 1).toString('base64'))).toThrow();
  });
  it.each(['findAll', 'create', 'update', 'visibility', 'remove'] as const)('restricts %s to administrators', (method) => {
    const guard = new RolesGuard(new Reflector());
    const context = (role: UserRole) => ({ getHandler: () => LocalServicesController.prototype[method], getClass: () => LocalServicesController, switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }) }) as unknown as ExecutionContext;
    expect(guard.canActivate(context(UserRole.ADMIN))).toBe(true);
    expect(() => guard.canActivate(context(UserRole.USER))).toThrow();
    expect(() => guard.canActivate(context(UserRole.INTERN))).toThrow();
  });
  it.each([UserRole.USER, UserRole.INTERN, UserRole.ADMIN])('only admin can request hidden services: %s', (role) => {
    const findAll = vi.fn();
    const controller = new LocalServicesController({ findAll } as never);
    controller.findAll({ role } as never, 'true');
    expect(findAll).toHaveBeenCalledWith(role === UserRole.ADMIN);
  });
});

describe('LocalServicesService persistence', () => {
  const create = vi.fn().mockImplementation(({ data }) => ({ ...data, id: 's1' }));
  const update = vi.fn();
  const remove = vi.fn();
  const findUnique = vi.fn().mockResolvedValue({ id: 's1' });
  const service = new LocalServicesService({ localService: { create, update, findUnique, delete: remove } } as never);
  it('stores uploaded icon with the service and clears it when switching to emoji', async () => {
    expect(await service.create({ ...input, iconType: 'image', imageData: image })).toMatchObject({ imageData: image });
    await service.update('s1', { ...input, imageData: image });
    expect(update).toHaveBeenCalledWith({ where: { id: 's1' }, data: expect.objectContaining({ imageData: null, iconType: 'emoji' }) });
  });
  it('rejects URLs containing credentials', () => {
    expect(() => service.create({ ...input, url: 'http://admin:secret@intranet' })).toThrow();
  });
  it('changes visibility without replacing name or image', async () => {
    await service.setVisibility('s1', false);
    expect(update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { isActive: false } });
  });
  it('removes service', async () => {
    await service.remove('s1');
    expect(remove).toHaveBeenCalledWith({ where: { id: 's1' } });
  });
  it('returns not found for an absent service', async () => {
    findUnique.mockResolvedValueOnce(null);
    await expect(service.update('missing', input)).rejects.toThrow('Сервис не найден');
  });
});
