import { Module } from '@nestjs/common';
import { STORAGE_PROVIDER } from './storage.interface.js';
import { LocalDiskStorageProvider } from './local-disk.provider.js';

@Module({
  providers: [{ provide: STORAGE_PROVIDER, useClass: LocalDiskStorageProvider }],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
