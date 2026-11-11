import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, HttpCode, Post, Put, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Env } from '../config/env.schema.js';
import { CollegeScheduleService } from './college-schedule.service.js';
import { ScheduleMaxService } from './schedule-max.service.js';

const person = z.object({ user_id: z.number().int().positive(), is_bot: z.boolean().optional() });
const update = z.discriminatedUnion('update_type', [
  z.object({ update_type: z.literal('bot_started'), user: person, chat_type: z.string().optional() }),
  z.object({
    update_type: z.literal('message_created'),
    message: z.object({
      sender: person,
      recipient: z.object({ chat_type: z.literal('dialog') }),
      body: z.object({ text: z.string() }),
    }),
  }),
]);
const digest = (value: string) => createHash('sha256').update(value).digest();
const initData = z.string().min(1).max(8192);
const subscription = z.object({
  initData,
  announcements: z.boolean(),
  selection: z.object({ scope: z.enum(['group', 'teacher']), target: z.string().trim().min(1).max(150) }).nullable(),
});

@Controller('college-schedule/max')
export class ScheduleMaxController {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly service: CollegeScheduleService,
    private readonly max: ScheduleMaxService,
  ) {}

  @Get('mini-app')
  async miniApp() {
    return { url: await this.max.miniAppUrl() };
  }

  @Post('subscription')
  @HttpCode(200)
  getSubscription(@Body('initData') input: unknown) {
    const parsed = initData.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Откройте расписание из MAX');
    return this.max.subscription(this.max.identify(parsed.data));
  }

  @Put('subscription')
  async setSubscription(@Body() body: unknown) {
    const parsed = subscription.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Проверьте настройки подписки');
    const userId = this.max.identify(parsed.data.initData);
    const { announcements, selection } = parsed.data;
    if (selection && !await this.service.hasSubscriptionTarget(selection)) {
      throw new BadRequestException('Группа или преподаватель не найдены в расписании');
    }
    return this.max.setSubscription(userId, announcements, selection);
  }

  @Post('webhook')
  @HttpCode(200)
  async receive(@Headers('x-max-bot-api-secret') provided: string | undefined, @Body() body: unknown) {
    const secret = this.config.get('SCHEDULE_MAX_WEBHOOK_SECRET', { infer: true });
    if (!secret || !this.max.configured()) {
      throw new ServiceUnavailableException('Бот расписания не настроен');
    }
    if (!provided || !timingSafeEqual(digest(secret), digest(provided))) throw new ForbiddenException();
    const parsed = update.safeParse(body);
    if (!parsed.success) return;

    const event = parsed.data;
    const user = event.update_type === 'bot_started' ? event.user : event.message.sender;
    if (user.is_bot) return;
    if (event.update_type === 'bot_started' && event.chat_type && event.chat_type !== 'dialog') return;
    if (event.update_type === 'message_created' && !/^\/(start|schedule)(?:\s|$)/i.test(event.message.body.text.trim())) return;

    const { currentWeek, announcement } = await this.service.settings();
    const weekText = currentWeek === 'red' ? '🔴 Красная неделя' : currentWeek === 'blue' ? '🔵 Синяя неделя' : '';
    return this.max.reply(String(user.user_id), [
      '📅 Расписание колледжа', weekText, announcement && `📢 ${announcement}`,
      '🔔 Чтобы получать замены и объявления, откройте расписание и нажмите «Уведомления».',
    ].filter(Boolean).join('\n\n'));
  }
}
