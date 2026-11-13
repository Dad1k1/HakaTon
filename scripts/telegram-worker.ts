import 'dotenv/config';
import { Client } from 'pg';
import { setTimeout as delay } from 'node:timers/promises';
import { db } from '../src/lib/db';
import {
  telegramCall,
  processTelegramUpdate,
  deliverTelegramNotifications,
  TelegramError,
  type TelegramUpdate,
} from '../src/lib/telegram';
import {
  saveTelegramWorkerStatus,
  telegramErrorDescription,
  type WorkerState,
} from '../src/lib/telegram-status';
async function main() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.log(
      'Telegram disabled. Set TELEGRAM_BOT_TOKEN in .env, then recreate the telegram service.',
    );
    // Keep the optional service running so the app can start without a configured bot.
    for (;;) await delay(60000);
  }
  const lock = new Client({ connectionString: process.env.DATABASE_URL });
  await lock.connect();
  lock.on('error', () => process.exit(1));
  if (!(await lock.query('SELECT pg_try_advisory_lock(9156007297) AS locked')).rows[0].locked) {
    await lock.end();
    console.error('Another Telegram worker is already using this database.');
    process.exit(1);
  }
  let running = true;
  process.on('SIGTERM', () => {
    running = false;
  });
  process.on('SIGINT', () => {
    running = false;
  });
  let state: WorkerState = { state: 'error', errorCode: 0 };
  const heartbeat = setInterval(() => {
    void saveTelegramWorkerStatus(state).catch(() => {});
  }, 10000);
  try {
    const bot = await telegramCall<{ id: number; username: string }>('getMe');
    const webhook = await telegramCall<{ url: string }>('getWebhookInfo');
    if (webhook.url) throw new TelegramError(409);
    state = { state: 'ready' };
    const offsetKey = 'telegramOffset:' + bot.id;
    let offset = Number((await db.setting.findUnique({ where: { key: offsetKey } }))?.value || 0);
    await saveTelegramWorkerStatus(state);
    console.log('Telegram worker connected to @' + bot.username);
    while (running) {
      try {
        // Process binding commands before draining the notification queue.
        const updates = await telegramCall<TelegramUpdate[]>('getUpdates', {
          offset,
          timeout: 5,
          allowed_updates: ['message'],
        });
        for (const update of updates) {
          try {
            await processTelegramUpdate(update);
          } catch (e) {
            if (!(e instanceof TelegramError) || ![400, 403].includes(e.code)) throw e;
            console.warn('Cannot reply to an unavailable Telegram chat; skipping this update.');
          }
          offset = update.update_id + 1;
          await db.setting.upsert({
            where: { key: offsetKey },
            create: { key: offsetKey, value: offset },
            update: { value: offset },
          });
        }
        await deliverTelegramNotifications();
        state = { state: 'ready' };
        await saveTelegramWorkerStatus(state);
      } catch (e) {
        const code = e instanceof TelegramError ? e.code : 0;
        state = { state: 'error', errorCode: code };
        await saveTelegramWorkerStatus(state).catch(() => {});
        console.error(telegramErrorDescription(code));
        await delay(e instanceof TelegramError && e.retryAfter ? e.retryAfter * 1000 : 5000);
      }
    }
  } catch (e) {
    const code = e instanceof TelegramError ? e.code : 0;
    state = { state: 'error', errorCode: code };
    await saveTelegramWorkerStatus(state).catch(() => {});
    console.error(telegramErrorDescription(code));
    throw new Error('Worker startup failed');
  } finally {
    clearInterval(heartbeat);
    if (!running) await saveTelegramWorkerStatus({ state: 'stopped' }).catch(() => {});
    await lock.end();
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error('Telegram worker could not start; see the diagnostic above.');
  process.exit(1);
});
