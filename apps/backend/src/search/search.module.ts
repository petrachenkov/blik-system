import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TicketsModule } from '../tickets/tickets.module.js';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';

@Module({
  imports: [TicketsModule, JwtModule.register({})],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
