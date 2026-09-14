import { Controller, HttpCode, HttpStatus, Post, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

/**
 * Заготовка под будущего бота в мессенджере Max (см. план — "Интеграция с Max").
 * Реальный обработчик входящих сообщений (создание заявок, чат) сюда подключится позже,
 * не трогая tickets/comments/auth — маршрут зарезервирован и пока намеренно неактивен.
 */
@ApiExcludeController()
@Controller('integrations/max')
export class MaxWebhookController {
  @Post('webhook')
  @HttpCode(HttpStatus.SERVICE_UNAVAILABLE)
  handleWebhook() {
    throw new ServiceUnavailableException('Интеграция с Max ещё не реализована');
  }
}
