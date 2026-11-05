import 'reflect-metadata';
import { Body, Controller, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureBodyParsing } from './body-parsing.js';

@Controller('api')
class JsonProbeController {
  @Post('notifications/broadcast')
  broadcast(@Body() body: unknown) { return { received: body }; }

  @Post('auth/login')
  login(@Body() body: unknown) { return { received: body }; }

  @Post('local-services')
  service(@Body() body: unknown) { return { received: body }; }
}

describe('Global JSON parsing', () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [JsonProbeController] }).compile();
    app = module.createNestApplication<NestExpressApplication>({ logger: false });
    configureBodyParsing(app);
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it('preserves title and body outside the local-services route', async () => {
    const payload = { title: 'Тест', body: 'ТЕСТ', targetUserId: 'recipient' };
    const response = await request(app.getHttpServer()).post('/api/notifications/broadcast').send(payload).expect(201);
    expect(response.body.received).toEqual(payload);
  });

  it('also parses login credentials', async () => {
    const payload = { username: 'test-user', password: 'test-only' };
    const response = await request(app.getHttpServer()).post('/api/auth/login').send(payload).expect(201);
    expect(response.body.received).toEqual(payload);
  });

  it('accepts service icons exceeding the default 100KB limit', async () => {
    const payload = { imageData: 'data:image/png;base64,' + 'A'.repeat(200_000) };
    const response = await request(app.getHttpServer()).post('/api/local-services').send(payload).expect(201);
    expect(response.body.received).toEqual(payload);
  });

  it('rejects malformed JSON', async () => {
    await request(app.getHttpServer()).post('/api/notifications/broadcast').set('Content-Type', 'application/json').send('{broken').expect(400);
  });

  it('keeps a bounded payload size', async () => {
    await request(app.getHttpServer()).post('/api/local-services').send({ imageData: 'A'.repeat(900_000) }).expect(413);
  });
});
