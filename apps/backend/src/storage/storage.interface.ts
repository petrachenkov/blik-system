export interface SavedFile {
  storedPath: string; // относительный путь внутри хранилища — то, что пишем в БД
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

/**
 * Абстракция хранения файлов (см. план). Сейчас — только LocalDiskStorageProvider,
 * позже можно добавить S3/MinIO-провайдер без изменения кода, который сюда обращается.
 */
export interface StorageProvider {
  save(buffer: Buffer, originalFilename: string): Promise<SavedFile>;
  getAbsolutePath(storedPath: string): string;
  delete(storedPath: string): Promise<void>;
}
