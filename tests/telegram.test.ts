import { describe, it, expect, vi, afterAll } from 'vitest';
import { db } from '../src/lib/db';
import { credentials } from './helpers';
import {
  tokenHash,
  processTelegramUpdate,
  deliverTelegramNotifications,
  TelegramError,
} from '../src/lib/telegram';
describe.skipIf(process.env.RUN_INTEGRATION !== '1')('Telegram binding and private outbox', () => {
  afterAll(() => db.$disconnect());
  it('consumes a private link once, hides old notifications, retries and respects unlinking', async () => {
    if (!process.env.DATABASE_URL?.endsWith('_test'))
      throw new Error('Dedicated test database required');
    const cfg = await credentials(),
      userId = cfg.users.employee.id;
    const token = 'a'.repeat(48),
      chatId = '-999000123';
    const call = vi.fn(
      async <T>(_method: string, _body: Record<string, unknown> = {}) => ({}) as T,
    );
    await db.telegramConnection.deleteMany({ where: { userId } });
    await db.notification.updateMany({ where: { userId }, data: { telegramSentAt: new Date() } });
    let appealId = '';
    try {
      await db.telegramConnection.create({
        data: { userId, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 60000) },
      });
      await processTelegramUpdate(
        {
          update_id: 1,
          message: { text: '/start ' + token, chat: { id: Number(chatId), type: 'group' } },
        },
        call,
      );
      expect(
        (await db.telegramConnection.findUniqueOrThrow({ where: { userId } })).chatId,
      ).toBeNull();
      await processTelegramUpdate(
        {
          update_id: 2,
          message: { text: '/start ' + token, chat: { id: Number(chatId), type: 'private' } },
        },
        call,
      );
      expect(
        (await db.telegramConnection.findUniqueOrThrow({ where: { userId } })).tokenHash,
      ).toBeNull();
      await processTelegramUpdate(
        {
          update_id: 3,
          message: { text: '/start ' + token, chat: { id: 999000124, type: 'private' } },
        },
        call,
      );
      expect((await db.telegramConnection.findUniqueOrThrow({ where: { userId } })).chatId).toBe(
        chatId,
      );
      const a = await db.appeal.create({
        data: {
          title: 'Telegram private outbox',
          description: 'Test',
          type: 'PROBLEM',
          authorId: userId,
          categoryId: cfg.categoryId,
          departmentId: cfg.departmentId,
          dueAt: new Date(),
        },
      });
      appealId = a.id;
      const old = await db.notification.create({
        data: { userId, appealId: a.id, kind: 'created', createdAt: new Date('2020-01-01') },
      });
      const note = await db.notification.create({
        data: { userId, appealId: a.id, kind: 'commented' },
      });
      call.mockClear();
      call.mockRejectedValueOnce(new TelegramError(429, 60));
      await deliverTelegramNotifications(call);
      let pending = await db.notification.findUniqueOrThrow({ where: { id: note.id } });
      expect(pending.telegramSentAt).toBeNull();
      expect(pending.telegramRetryAt!.getTime()).toBeGreaterThan(Date.now());
      await db.notification.update({ where: { id: note.id }, data: { telegramRetryAt: null } });
      await deliverTelegramNotifications(call);
      expect(
        (await db.notification.findUniqueOrThrow({ where: { id: note.id } })).telegramSentAt,
      ).not.toBeNull();
      expect(call.mock.calls.every(([, body]) => body?.chat_id === chatId)).toBe(true);
      expect(
        call.mock.calls.filter(([, body]) =>
          String(body?.text).includes('Telegram private outbox'),
        ),
      ).toHaveLength(2);
      expect(
        (await db.notification.findUniqueOrThrow({ where: { id: old.id } })).telegramSentAt,
      ).not.toBeNull();
      await processTelegramUpdate(
        { update_id: 4, message: { text: '/stop', chat: { id: Number(chatId), type: 'private' } } },
        call,
      );
      expect(await db.telegramConnection.findUnique({ where: { userId } })).toBeNull();
      call.mockClear();
      await db.notification.create({ data: { userId, appealId: a.id, kind: 'commented' } });
      await deliverTelegramNotifications(call);
      expect(call).not.toHaveBeenCalled();
    } finally {
      await db.telegramConnection.deleteMany({ where: { userId } });
      if (appealId) {
        await db.notification.deleteMany({ where: { appealId } });
        await db.appeal.delete({ where: { id: appealId } });
      }
    }
  });
});
