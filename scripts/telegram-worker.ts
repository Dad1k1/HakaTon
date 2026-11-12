import 'dotenv/config';
import { Client } from 'pg';
import { setTimeout as delay } from 'node:timers/promises';
import { db } from '../src/lib/db';
import {
  telegramCall,
  processTelegramUpdate,
  deliverTelegramNotifications,
  type TelegramUpdate,
} from '../src/lib/telegram';
async function main() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.log('Telegram disabled: configure TELEGRAM_BOT_TOKEN.');
    return;
  }
  const lock = new Client({ connectionString: process.env.DATABASE_URL });
  await lock.connect();
  lock.on('error', () => process.exit(1));
  if (!(await lock.query('SELECT pg_try_advisory_lock(9156007297) AS locked')).rows[0].locked) {
    await lock.end();
    throw new Error('Only one Telegram worker may run');
  }
  let running = true;
  process.on('SIGTERM', () => {
    running = false;
  });
  process.on('SIGINT', () => {
    running = false;
  });
  const bot = await telegramCall<{ id: number }>('getMe');
  const offsetKey = 'telegramOffset:' + bot.id;
  let offset = Number((await db.setting.findUnique({ where: { key: offsetKey } }))?.value || 0);
  console.log('Telegram worker started.');
  try {
    while (running) {
      try {
        await deliverTelegramNotifications();
        const updates = await telegramCall<TelegramUpdate[]>('getUpdates', {
          offset,
          timeout: 5,
          allowed_updates: ['message'],
        });
        for (const update of updates) {
          await processTelegramUpdate(update);
          offset = update.update_id + 1;
          await db.setting.upsert({
            where: { key: offsetKey },
            create: { key: offsetKey, value: offset },
            update: { value: offset },
          });
        }
      } catch {
        console.error('Telegram temporarily unavailable; retrying.');
        await delay(5000);
      }
    }
  } finally {
    await lock.end();
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error('Telegram worker could not start.');
  process.exit(1);
});
