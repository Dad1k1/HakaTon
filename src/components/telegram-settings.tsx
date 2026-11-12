'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useApp, useLoad } from './context';
import { Button } from './ui/button';
export function TelegramSettings() {
  const t = useTranslations();
  const { api, refresh, setError } = useApp();
  const { data } = useLoad<{ enabled: boolean; connected: boolean }>('telegram');
  const [link, setLink] = useState(''),
    [busy, setBusy] = useState(false);
  async function action(action: 'connect' | 'disconnect') {
    setBusy(true);
    try {
      const result = await api<{ url?: string }>('telegram', { action });
      setLink(result.url || '');
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
      {data?.enabled &&
        (data.connected ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void action('disconnect')}
          >
            {t('telegramDisconnect')}
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
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
              </div>
            )}
          </>
        ))}
    </section>
  );
}
