import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Проверяет access-токен (стратегия 'jwt'). Применяется глобально либо через @UseGuards. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
