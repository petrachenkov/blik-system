import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import type { Env } from '../config/env.schema.js';
import type { SavedFile, StorageProvider } from './storage.interface.js';

@Injectable()
export class LocalDiskStorageProvider implements StorageProvider {
  private readonly uploadsDir: string;

  constructor(config: ConfigService<Env, true>) {
    this.uploadsDir = resolve(config.get('UPLOADS_DIR', { infer: true }));
  }

  async save(buffer: Buffer, originalFilename: string): Promise<SavedFile> {
    // Партиционируем по дате, чтобы не складывать десятки тысяч файлов в одну директорию.
    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
    const dir = join(this.uploadsDir, datePrefix);
    await mkdir(dir, { recursive: true });

    const safeExt = extname(originalFilename).slice(0, 10);
    const filename = `${randomUUID()}${safeExt}`;
    const storedPath = join(datePrefix, filename).replace(/\\/g, '/');

    await writeFile(join(this.uploadsDir, storedPath), buffer);

    return { storedPath };
  }

  getAbsolutePath(storedPath: string): string {
    return join(this.uploadsDir, storedPath);
  }

  async delete(storedPath: string): Promise<void> {
    await unlink(this.getAbsolutePath(storedPath)).catch(() => undefined);
  }
}
