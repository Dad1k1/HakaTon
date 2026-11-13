'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useApp, useLoad } from './context';
import { Button } from './ui/button';
export function TelegramSettings() {
  const t = useTranslations();
  const { api, refresh, setError, notice } = useApp();
  const { data } = useLoad<{
    enabled: boolean;
    connected: boolean;
    worker?: { running: boolean; ready: boolean; errorCode?: number };
  }>('telegram');
  const [link, setLink] = useState(''),
    [busy, setBusy] = useState(false);
  async function action(action: 'connect' | 'disconnect' | 'test') {
    setBusy(true);
    try {
      const result = await api<{ url?: string }>('telegram', { action });
      setLink(result.url || '');
      if (action === 'test') notice(t('telegramTestSent'));
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="telegram-settings">
      <h3 className="font-semibold">Telegram</h3>
      <p className="muted text-xs leading-6 my-3">
        {t(
          !data
            ? 'loading'
            : !data.enabled
              ? 'telegramDisabled'
              : data.connected
                ? 'telegramConnected'
                : 'telegramHint',
        )}
      </p>
      {data?.enabled && (
        <p
          role="status"
          className={`text-xs leading-6 mb-4 ${data.worker?.ready ? 'muted' : 'error'}`}
        >
          {t(
            data.worker?.ready
              ? 'telegramWorkerReady'
              : !data.worker?.running
                ? 'telegramWorkerOffline'
                : data.worker.errorCode === 401
                  ? 'telegramTokenRejected'
                  : data.worker.errorCode === 409
                    ? 'telegramPollingConflict'
                    : 'telegramWorkerError',
          )}
        </p>
      )}
      {data?.enabled &&
        (data.connected ? (
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={busy || !data.worker?.ready}
              onClick={() => void action('test')}
            >
              {t('telegramTest')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void action('disconnect')}
            >
              {t('telegramDisconnect')}
            </Button>
          </div>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !data.worker?.ready}
              onClick={() => void action('connect')}
            >
              {t(busy ? 'loading' : 'telegramConnect')}
            </Button>
            {link && (
              <div className="surface rounded-2xl p-4 mt-4">
                <a
                  className="underline font-medium"
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('telegramOpen')}
                </a>
                <p className="muted text-xs leading-6 mt-2">{t('telegramStart')}</p>
                <label htmlFor="telegram-start-command" className="mt-3">
                  {t('telegramManualCommand')}
                </label>
                <textarea
                  id="telegram-start-command"
                  className="!min-h-0 !text-xs"
                  rows={2}
                  readOnly
                  value={'/start ' + new URL(link).searchParams.get('start')}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <p className="muted text-xs leading-6 mt-2">{t('telegramManualHint')}</p>
              </div>
            )}
          </>
        ))}
    </section>
  );
}
