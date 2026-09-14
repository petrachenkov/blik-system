import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.schema.js';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<Env, true>);

  // Доверяем первому хопу (единственный reverse-proxy перед приложением, см.
  // infra/docker-compose.yml) — иначе req.ip в журнале входов будет адресом nginx,
  // а не реального клиента (см. план "Журнал входов").
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get('CORS_ORIGIN', { infer: true }),
    credentials: true,
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  // HttpExceptionFilter регистрируется как APP_FILTER в SystemModule (нужен DI для ErrorLogService).

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Blik API')
    .setDescription('Система заявок на техническое обслуживание для колледжа')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Blik backend запущен на порту ${port} (Swagger: /api/docs)`);
}

await bootstrap();
