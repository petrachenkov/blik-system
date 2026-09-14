import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { SkipThrottle } from '@nestjs/throttler';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { Env } from '../config/env.schema.js';
import { UserRole } from '../../generated/prisma/index.js';
import type { JwtAccessPayload } from '../auth/strategies/jwt.strategy.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TicketsService } from './tickets.service.js';
import { TicketPolicy } from './policies/ticket-policy.js';
import { CommentsService } from './comments/comments.service.js';
import { FeatureFlagsService } from '../system/feature-flags.service.js';
import { FEATURE_FLAGS } from '../system/feature-flags.js';
import { TICKET_EVENTS, type TicketCommentedEvent } from '../notifications/events/ticket-events.js';

interface SocketData {
  user: AuthenticatedUser;
}

/**
 * Realtime по конкретной заявке (см. план "«Печатает…» + live-обновление чата") — отдельный
 * namespace от NotificationsGateway (тот глобальный, по userId; этот — потикетный, по ticketId),
 * чтобы не путать разные подписки. Тот же паттерн аутентификации: JWT в query при коннекте.
 */
// Глобальный ThrottlerGuard (APP_GUARD в app.module.ts) рассчитан только на HTTP — его
// handleRequest() безусловно дёргает res.header(...), а в WS-контексте switchToHttp() отдаёт
// вместо ответа сырые данные события, из-за чего @SubscribeMessage-хендлеры падали с
// "res.header is not a function" при каждом join/typing (см. фидбэк — не работал живой чат).
// NotificationsGateway этой проблемы не проявлял, т.к. в нём вообще нет @SubscribeMessage.
@SkipThrottle()
@Injectable()
@WebSocketGateway({ namespace: '/tickets', cors: { origin: true, credentials: true } })
export class TicketsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(TicketsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly ticketsService: TicketsService,
    private readonly commentsService: CommentsService,
    private readonly policy: TicketPolicy,
    private readonly flags: FeatureFlagsService,
  ) {}

  handleConnection(client: Socket<any, any, any, SocketData>) {
    try {
      const token = client.handshake.query.token as string | undefined;
      if (!token) throw new Error('no token');

      const payload = this.jwtService.verify<JwtAccessPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
      client.data.user = {
        id: payload.sub,
        username: payload.username,
        role: payload.role,
        isStaff: payload.isStaff,
        isMaster: payload.isMaster,
      };
    } catch {
      this.logger.warn('Отклонено WebSocket-подключение: невалидный или отсутствующий токен');
      client.disconnect(true);
    }
  }

  handleDisconnect() {
    // комнаты socket.io чистятся автоматически при дисконнекте
  }

  /** Заявка видна проверяем через TicketPolicy.canView — так же, как REST-эндпоинт GET :id. */
  @SubscribeMessage('join')
  async handleJoin(@ConnectedSocket() client: Socket<any, any, any, SocketData>, @MessageBody() data: { ticketId?: string }) {
    const user = client.data.user;
    if (!user || !data?.ticketId) return;
    if (!(await this.flags.isEnabled(FEATURE_FLAGS.LIVE_CHAT))) return;

    const ticket = await this.ticketsService.findOneOrThrow(data.ticketId).catch(() => null);
    if (!ticket || !this.policy.canView(user, ticket)) return;

    client.join(this.roomFor(data.ticketId));
    if (user.role !== UserRole.USER) {
      client.join(this.staffRoomFor(data.ticketId));
    }
  }

  @SubscribeMessage('leave')
  handleLeave(@ConnectedSocket() client: Socket<any, any, any, SocketData>, @MessageBody() data: { ticketId?: string }) {
    if (!data?.ticketId) return;
    client.leave(this.roomFor(data.ticketId));
    client.leave(this.staffRoomFor(data.ticketId));
  }

  /** Ретранслируем остальным в комнате, не самому отправителю — socket.to() уже это делает. */
  @SubscribeMessage('typing')
  async handleTyping(@ConnectedSocket() client: Socket<any, any, any, SocketData>, @MessageBody() data: { ticketId?: string }) {
    const user = client.data.user;
    if (!user || !data?.ticketId) return;

    const dbUser = await this.prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } });
    if (!dbUser) return;

    client.to(this.roomFor(data.ticketId)).emit('typing', { userId: user.id, fullName: dbUser.fullName });
  }

  /**
   * Внутренние заметки летят только в подкомнату сотрудников — заявитель не должен узнать
   * даже о факте их появления (см. план "Внутренние заметки", тот же принцип, что и в
   * NotificationsService.onTicketCommented).
   */
  @OnEvent(TICKET_EVENTS.COMMENTED)
  async onTicketCommented(event: TicketCommentedEvent) {
    const comment = await this.commentsService.findOneOrThrow(event.commentId).catch(() => null);
    if (!comment) return;

    const room = event.isInternal ? this.staffRoomFor(event.ticketId) : this.roomFor(event.ticketId);
    this.server?.to(room).emit('comment', comment);
  }

  private roomFor(ticketId: string) {
    return `ticket:${ticketId}`;
  }

  private staffRoomFor(ticketId: string) {
    return `ticket:${ticketId}:staff`;
  }
}
