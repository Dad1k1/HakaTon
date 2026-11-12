'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowRight,
  Bell,
  BellOff,
  CheckCheck,
  Clock,
  FileText,
  MessageSquare,
  X,
} from 'lucide-react';
import { Button } from './ui/button';
import { date, num, type Notification, useApp } from './context';

export function NotificationCenter({
  notes,
  close,
  onRead,
}: {
  notes: Notification[];
  close: () => void;
  onRead: (ids: string[]) => void;
}) {
  const t = useTranslations();
  const { api, navigate, locale, setError } = useApp();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = notes.filter((n) => !n.readAt).length;
  const visible = filter === 'unread' ? notes.filter((n) => !n.readAt) : notes;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    const outside = (e: PointerEvent) => {
      if (
        !ref.current?.contains(e.target as Node) &&
        !(e.target as Element).closest('[data-tour="notifications"]')
      )
        close();
    };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', outside);
      previous?.focus();
    };
  }, [close]);
  async function mark(id?: string) {
    setBusy(true);
    try {
      await api('notifications', id ? { id } : {});
      onRead(id ? [id] : notes.map((n) => n.id));
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      id="notification-center"
      ref={ref}
      role="dialog"
      aria-labelledby="notification-title"
      className="notification-center panel"
    >
      <div className="notification-header">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 id="notification-title" className="text-lg font-semibold">
              {t('notifications')}
            </h2>
            {unread > 0 && <span className="notification-count">{unread}</span>}
          </div>
          <Button variant="ghost" size="icon" aria-label={t('close')} onClick={close}>
            <X size={19} />
          </Button>
        </div>
        <div className="notification-toolbar">
          <div className="segmented" aria-label={t('notificationsUi.filter')}>
            <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
              {t('all')}
            </button>
            <button aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')}>
              {t('notificationsUi.unread')}
              {unread > 0 && <span className="ml-1.5 opacity-60">{unread}</span>}
            </button>
          </div>
          <Button variant="ghost" size="sm" disabled={busy || !unread} onClick={() => void mark()}>
            <CheckCheck size={16} />
            {t('markAll')}
          </Button>
        </div>
      </div>
      <div className="notification-list" aria-busy={busy}>
        {!visible.length && (
          <div className="notification-empty">
            <span>
              <BellOff size={24} />
            </span>
            <h3 className="font-medium">
              {t(filter === 'unread' ? 'notificationsUi.caughtUp' : 'notificationsUi.empty')}
            </h3>
            <p className="muted text-xs mt-2">{t('notificationsUi.hint')}</p>
          </div>
        )}
        {visible.map((n) => {
          const comment = n.kind.startsWith('comment');
          const Icon = comment ? MessageSquare : n.kind === 'reminder' ? Clock : FileText;
          return (
            <article key={n.id} className={`notification-item ${!n.readAt ? 'is-unread' : ''}`}>
              <span className={`notification-icon ${comment ? 'is-comment' : ''}`}>
                <Icon size={20} />
                {!n.readAt && <i aria-label={t('notificationsUi.unread')} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="notification-meta">
                  <strong>{num(n.appeal.number)}</strong>
                  <span>· {t(`events.${n.kind}`)}</span>
                </p>
                <h3 className="notification-subject">{n.appeal.title}</h3>
                <div className="notification-item-footer">
                  <time dateTime={n.createdAt} className="muted text-[11px]">
                    {date(n.createdAt, locale, true)}
                  </time>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    className="notification-go"
                    aria-label={`${t('notificationsUi.open')} ${num(n.appeal.number)}`}
                    onClick={async () => {
                      if (!n.readAt && !(await mark(n.id))) return;
                      close();
                      navigate({ view: 'appeals', id: n.appeal.id });
                    }}
                  >
                    {t('notificationsUi.open')}
                    <ArrowRight size={14} />
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {notes.length > 0 && (
        <div className="notification-footer">
          <Bell size={12} />
          {t('notificationsUi.latest')}
        </div>
      )}
    </section>
  );
}
