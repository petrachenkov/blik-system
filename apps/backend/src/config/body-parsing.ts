import type { NestExpressApplication } from '@nestjs/platform-express';

export function configureBodyParsing(app: NestExpressApplication): void {
  // Nest определяет наличие jsonParser по имени middleware, без учёта пути.
  // Поэтому JSON-парсер регистрируем глобально: иконкам нужно больше стандартных
  // 100 КБ, а остальные endpoints тоже должны получать разобранное тело запроса.
  app.useBodyParser('json', { limit: '800kb' });
}
