import { Module } from '@nestjs/common';
import { LdapModule } from '../auth/ldap/ldap.module.js';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';

@Module({
  imports: [LdapModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
