import { createHash, randomBytes } from 'node:crypto';
import { fetch, EnvHttpProxyAgent } from 'undici';
import { db } from './db';
import { Prisma } from '@prisma/client';
import { canSee } from './domain';
import ru from '../messages/ru.json';
import en from '../messages/en.json';
import kk from '../messages/kk.json';
const dispatcher = new EnvHttpProxyAgent();
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
export async function telegramCall<T>(
  method: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Telegram is not configured');
  // Never propagate a fetch exception: it may contain the URL and bot token.
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(method === 'getUpdates' ? 35000 : 12000),
      dispatcher,
    });
    const data = (await response.json()) as {
      ok: boolean;
      result: T;
      error_code?: number;
      parameters?: { retry_after?: number };
    };
    if (!data.ok)
      throw new TelegramError(data.error_code || response.status, data.parameters?.retry_after);
    return data.result;
  } catch (e) {
    if (e instanceof TelegramError) throw e;
    throw new TelegramError(0);
  }
}
export class TelegramError extends Error {
  constructor(
    public code: number,
    public retryAfter?: number,
  ) {
    super('Telegram request failed');
  }
}
export async function createTelegramLink(userId: string) {
  const bot = await telegramCall<{ username: string }>('getMe');
  const token = randomBytes(24).toString('hex');
  const existing = await db.telegramConnection.findUnique({ where: { userId } });
  if (existing?.chatId) throw new Error('Already connected');
  await db.telegramConnection.upsert({
    where: { userId },
    create: { userId, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 600000) },
    update: { tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 600000) },
  });
  return { url: `https://t.me/${bot.username}?start=${token}`, expiresIn: 600 };
}
export type TelegramUpdate = {
  update_id: number;
  message?: { text?: string; chat: { id: number; type: string }; from?: { id: number } };
};
type TelegramSender = (method: string, body?: Record<string, unknown>) => Promise<unknown>;
export async function processTelegramUpdate(
  update: TelegramUpdate,
  call: TelegramSender = telegramCall,
) {
  const message = update.message;
  if (!message || message.chat.type !== 'private') return;
  const chatId = String(message.chat.id);
  const text = (message.text || '').trim();
  if (/^\/stop(?:@\w+)?$/.test(text)) {
    await db.telegramConnection.deleteMany({ where: { chatId } });
    await call('sendMessage', {
      chat_id: chatId,
      text: 'Уведомления отключены. Подключить их снова можно в настройках кабинета.',
    });
    return;
  }
  const match = /^\/start(?:@\w+)?\s+([a-f0-9]{48})$/.exec(text);
  if (!match) {
    const existing = await db.telegramConnection.findUnique({
      where: { chatId },
      include: { user: true },
    });
    const linked = existing && !existing.user.blocked && !existing.user.deletedAt;
    await call('sendMessage', {
      chat_id: chatId,
      text: linked
        ? 'Telegram уже привязан. Новые уведомления будут приходить сюда. Отключение: /stop.'
        : 'Откройте настройки профиля на сайте → Telegram → Подключить Telegram. Нажмите «Запустить» по ссылке или отправьте полную команду /start с кодом из настроек. Обычный /start без кода не привязывает аккаунт.',
    });
    return;
  }
  let connected = false;
  try {
    const result = await db.telegramConnection.updateMany({
      where: {
        tokenHash: tokenHash(match[1]),
        expiresAt: { gt: new Date() },
        chatId: null,
        user: { blocked: false, deletedAt: null },
      },
      data: { chatId, connectedAt: new Date(), tokenHash: null, expiresAt: null },
    });
    connected = result.count === 1;
  } catch (e) {
    // Only a duplicate chat is a binding conflict; database outages must be retried.
    if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') throw e;
  }
  await call('sendMessage', {
    chat_id: chatId,
    text: connected
      ? 'Telegram привязан. Здесь будут появляться новые уведомления из кабинета. Отключение: /stop.'
      : 'Ссылка устарела или уже использована. Создайте новую ссылку в настройках профиля.',
  });
}
export async function deliverTelegramNotifications(call: TelegramSender = telegramCall) {
  const now = new Date();
  const notes = await db.notification.findMany({
    where: {
      telegramSentAt: null,
      deliverAt: { lte: now },
      OR: [{ telegramRetryAt: null }, { telegramRetryAt: { lte: now } }],
      user: { blocked: false, deletedAt: null, telegram: { chatId: { not: null } } },
    },
    include: { user: { include: { telegram: true } }, appeal: true },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });
  for (const n of notes) {
    const connection = n.user.telegram;
    if (
      !connection?.chatId ||
      !connection.connectedAt ||
      n.createdAt < connection.connectedAt ||
      !canSee(n.user, n.appeal)
    ) {
      await db.notification.update({ where: { id: n.id }, data: { telegramSentAt: new Date() } });
      continue;
    }
    const lease = await db.notification.updateMany({
      where: { id: n.id, telegramSentAt: null, telegramRetryAt: n.telegramRetryAt },
      data: { telegramRetryAt: new Date(Date.now() + 60000), telegramAttempts: { increment: 1 } },
    });
    if (!lease.count) continue;
    // Recheck unlinking immediately before delivery; only the recipient sees their notification.
    const active = await db.telegramConnection.findUnique({ where: { userId: n.userId } });
    if (active?.chatId !== connection.chatId) continue;
    const messages = ({ ru, en, kk } as const)[n.user.locale as 'ru' | 'en' | 'kk'] || ru;
    const event = (messages.events as Record<string, string>)[n.kind] || messages.notifications;
    let text = `${event}\nA-${String(n.appeal.number).padStart(3, '0')} · ${n.appeal.title}`;
    const base = process.env.TELEGRAM_APP_URL;
    if (base) {
      try {
        const url = new URL(base);
        if (['http:', 'https:'].includes(url.protocol)) {
          url.searchParams.set('view', 'appeals');
          url.searchParams.set('id', n.appealId);
          text += '\n' + url.toString();
        }
      } catch {}
    }
    try {
      await call('sendMessage', {
        chat_id: connection.chatId,
        text,
        link_preview_options: { is_disabled: true },
      });
      await db.notification.update({
        where: { id: n.id },
        data: { telegramSentAt: new Date(), telegramRetryAt: null },
      });
    } catch (e) {
      if (e instanceof TelegramError && e.code === 403)
        await db.telegramConnection.deleteMany({
          where: { userId: n.userId, chatId: connection.chatId },
        });
      const seconds =
        e instanceof TelegramError && e.retryAfter
          ? e.retryAfter
          : Math.min(3600, 15 * 2 ** n.telegramAttempts);
      await db.notification.update({
        where: { id: n.id },
        data: { telegramRetryAt: new Date(Date.now() + seconds * 1000) },
      });
      if (e instanceof TelegramError && [0, 401, 429].includes(e.code)) break;
    }
  }
}
