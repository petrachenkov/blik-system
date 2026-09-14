import { Module } from '@nestjs/common';
import { LdapService } from './ldap.service.js';

// Вынесен в отдельный модуль, чтобы AuthModule и UsersModule могли оба использовать
// LdapService без циклической зависимости (AuthModule и так импортирует UsersModule).
@Module({
  providers: [LdapService],
  exports: [LdapService],
})
export class LdapModule {}
