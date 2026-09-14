import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorSource } from '../../../generated/prisma/index.js';
import { ErrorLogService } from '../../system/error-log.service.js';
import type { AuthenticatedUser } from '../types/authenticated-user.js';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly errorLog: ErrorLogService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { user?: AuthenticatedUser }>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = isHttpException
      ? exception.getResponse()
      : { message: 'Внутренняя ошибка сервера' };

    // Пишем в журнал ошибок только настоящие сбои (500+ или не-HTTP исключения), не 4xx.
    if (!isHttpException || status >= 500) {
      if (!isHttpException) {
        this.logger.error(exception instanceof Error ? exception.stack : exception);
      }
      // capture никогда не бросает и не проходит повторно через этот фильтр.
      void this.errorLog.capture({
        source: ErrorSource.BACKEND,
        message: exception instanceof Error ? exception.message : String(exception),
        stack: exception instanceof Error ? exception.stack : null,
        route: request?.originalUrl ?? request?.url ?? null,
        method: request?.method ?? null,
        statusCode: status,
        userId: request?.user?.id ?? null,
        userAgent: request?.headers?.['user-agent'] ?? null,
      });
    }

    response.status(status).json(
      typeof body === 'string'
        ? { statusCode: status, message: body }
        : { statusCode: status, ...body },
    );
  }
}
