import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { Env } from '../config/env.schema.js';
import type { Notification } from '../../generated/prisma/index.js';
import type { JwtAccessPayload } from '../auth/strategies/jwt.strategy.js';

/**
 * Realtime push уведомлений (колокольчик на фронтенде). Клиент подключается с access-токеном
 * в query (`?token=...`) — тот же JWT, что используется для REST. Каждый пользователь сидит
 * в своей комнате (userId), поэтому push идёт адресно.
 */
@Injectable()
@WebSocketGateway({ namespace: '/notifications', cors: { origin: true, credentials: true } })
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  handleConnection(client: Socket) {
    try {
      const token = client.handshake.query.token as string | undefined;
      if (!token) throw new Error('no token');

      const payload = this.jwtService.verify<JwtAccessPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
      client.join(this.roomFor(payload.sub));
    } catch {
      this.logger.warn('Отклонено WebSocket-подключение: невалидный или отсутствующий токен');
      client.disconnect(true);
    }
  }

  handleDisconnect() {
    // комнаты socket.io чистятся автоматически при дисконнекте
  }

  pushToUser(userId: string, notification: Notification) {
    this.server?.to(this.roomFor(userId)).emit('notification', notification);
  }

  private roomFor(userId: string) {
    return `user:${userId}`;
  }
}
