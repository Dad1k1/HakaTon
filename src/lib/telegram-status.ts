import { createHash } from 'node:crypto';
import { db } from './db';
export type WorkerState = { state: 'ready' | 'error' | 'stopped'; errorCode?: number };
export function workerFingerprint() {
  return createHash('sha256')
    .update(process.env.TELEGRAM_BOT_TOKEN || '')
    .digest('hex');
}
export async function saveTelegramWorkerStatus(state: WorkerState) {
  const value = { ...state, checkedAt: Date.now(), fingerprint: workerFingerprint() };
  await db.setting.upsert({
    where: { key: 'telegramWorkerStatus' },
    create: { key: 'telegramWorkerStatus', value },
    update: { value },
  });
}
export async function getTelegramWorkerStatus() {
  const row = await db.setting.findUnique({ where: { key: 'telegramWorkerStatus' } });
  const value = row?.value as
    | { checkedAt?: number; fingerprint?: string; state?: string; errorCode?: number }
    | undefined;
  const running =
    !!process.env.TELEGRAM_BOT_TOKEN &&
    typeof value?.checkedAt === 'number' &&
    Date.now() - value.checkedAt < 45000 &&
    value.fingerprint === workerFingerprint() &&
    value.state !== 'stopped';
  return {
    running,
    ready: running && value?.state === 'ready',
    ...(running && value?.state === 'error' ? { errorCode: value.errorCode ?? 0 } : {}),
  };
}
export function telegramErrorDescription(code: number) {
  if (code === 401) return 'Telegram rejected the bot token (401). Check TELEGRAM_BOT_TOKEN.';
  if (code === 409)
    return 'Telegram polling conflict (409). Stop another bot process or remove its webhook.';
  if (code === 429) return 'Telegram rate limit (429). Retrying after a delay.';
  return 'Telegram is temporarily unavailable. Check the network and database; retrying.';
}
