'use client';
import { useCallback, useEffect, useState } from 'react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import {
  ArrowRight,
  Bell,
  ChartNoAxesCombined,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  ShieldCheck,
  Sun,
  Moon,
  X,
  CheckCheck,
  CheckCircle2,
} from 'lucide-react';
import ru from '@/messages/ru.json';
import kk from '@/messages/kk.json';
import en from '@/messages/en.json';
import { Button } from './ui/button';
import {
  AppContext,
  type User,
  type Locale,
  type Lookups,
  type Notification,
  date,
  num,
} from './context';
import { Overview, AppealList, AnalyticsScreen, NewAppeal, AppealDetail } from './appeals';
import { SettingsScreen, PasswordForm } from './settings';
import { signOutLocally } from '@/lib/session-client';
const messages = { ru, kk, en };
export function Workspace() {
  const [locale, setL] = useState<Locale>('ru'),
    [theme, setT] = useState<'light' | 'dark'>('light'),
    [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [query, setQuery] = useState(new URLSearchParams()),
    [lookups, setLookups] = useState<Lookups>({ categories: [], departments: [], users: [] }),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  useEffect(() => {
    const l = localStorage.getItem('locale'),
      t = localStorage.getItem('theme');
    if (l && l in messages) setL(l as Locale);
    if (t === 'dark') setT('dark');
    setQuery(new URLSearchParams(location.search));
    setReady(true);
    const pop = () => setQuery(new URLSearchParams(location.search));
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  const api = useCallback(async <T,>(p: string, body?: unknown): Promise<T> => {
    const r = await fetch('/api/data/' + p, {
      method: body === undefined ? 'GET' : 'POST',
      ...(body instanceof FormData
        ? { body }
        : body === undefined
          ? {}
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    const data = await r.json();
    if (!r.ok) {
      if (r.status === 401) setUser(null);
      throw new Error(data.error || 'serverError');
    }
    return data;
  }, []);
  const setLocale = useCallback(
    (l: Locale) => {
      setL(l);
      localStorage.setItem('locale', l);
      document.documentElement.lang = l;
      if (user && !user.mustChangePassword)
        void api('profile', { locale: l }).catch((e) => setError(e.message));
    },
    [user, api],
  );
  const setTheme = useCallback(
    (t: 'light' | 'dark') => {
      setT(t);
      localStorage.setItem('theme', t);
      document.documentElement.classList.toggle('dark', t === 'dark');
      if (user && !user.mustChangePassword)
        void api('profile', { theme: t }).catch((e) => setError(e.message));
    },
    [user, api],
  );
  const refresh = useCallback(() => setRevision((r) => r + 1), []);
  const loadUser = useCallback(async () => {
    try {
      const u = await api<User>('me');
      setUser(u);
      setL(u.locale);
      setT(u.theme);
      localStorage.setItem('locale', u.locale);
      localStorage.setItem('theme', u.theme);
      document.documentElement.lang = u.locale;
      document.documentElement.classList.toggle('dark', u.theme === 'dark');
    } catch {
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    void loadUser();
  }, [loadUser, revision]);
  useEffect(() => {
    if (user && !user.mustChangePassword)
      api<Lookups>('lookups')
        .then(setLookups)
        .catch((e) => setError(e.message));
  }, [user?.id, user?.mustChangePassword, api, revision]);
  const navigate = useCallback((params: Record<string, string>) => {
    const q = new URLSearchParams(params);
    history.pushState({}, '', `/?${q}`);
    setQuery(q);
    setError('');
    setSuccess('');
    window.scrollTo({ top: 0 });
  }, []);
  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="UTC">
      {!ready || loading ? (
        <div className="min-h-screen grid place-items-center">
          <span className="muted">{messages[locale].loading}</span>
        </div>
      ) : !user ? (
        <Login
          locale={locale}
          theme={theme}
          setLocale={setLocale}
          setTheme={setTheme}
          onLogin={loadUser}
        />
      ) : (
        <AppContext.Provider
          value={{
            user,
            lookups,
            locale,
            theme,
            setLocale,
            setTheme,
            api,
            refresh,
            revision,
            navigate,
            query,
            notice: setSuccess,
            error,
            setError,
          }}
        >
          <Shell
            error={error}
            success={success}
            clear={() => {
              setError('');
              setSuccess('');
            }}
          />
        </AppContext.Provider>
      )}
    </NextIntlClientProvider>
  );
}
function Preferences({
  locale,
  theme,
  setLocale,
  setTheme,
}: {
  locale: Locale;
  theme: 'light' | 'dark';
  setLocale: (l: Locale) => void;
  setTheme: (t: 'light' | 'dark') => void;
}) {
  const t = useTranslations();
  return (
    <div className="flex items-center gap-2">
      <select
        aria-label={t('language')}
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="!w-auto !border-0 !bg-transparent !text-xs"
      >
        <option value="ru">Русский</option>
        <option value="kk">Қазақша</option>
        <option value="en">English</option>
      </select>
      <Button
        variant="ghost"
        size="icon"
        title={t(theme === 'dark' ? 'light' : 'dark')}
        aria-label={t(theme === 'dark' ? 'light' : 'dark')}
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      >
        {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
      </Button>
    </div>
  );
}
function Login({
  locale,
  theme,
  setLocale,
  setTheme,
  onLogin,
}: {
  locale: Locale;
  theme: 'light' | 'dark';
  setLocale: (l: Locale) => void;
  setTheme: (t: 'light' | 'dark') => void;
  onLogin: () => Promise<void>;
}) {
  const t = useTranslations();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    try {
      const csrfResponse = await fetch('/api/auth/csrf', { cache: 'no-store' });
      if (!csrfResponse.ok) throw new Error('serverError');
      const { csrfToken } = await csrfResponse.json();
      const response = await fetch('/api/auth/callback/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          csrfToken,
          callbackUrl: window.location.href,
          json: 'true',
          login: String(f.get('login') || ''),
          password: String(f.get('password') || ''),
        }),
      });
      const result = await response.json();
      const destination = new URL(result.url || '/', window.location.origin);
      if (!response.ok || destination.searchParams.has('error')) setError(t('errors.invalidLogin'));
      else await onLogin();
    } catch {
      setError(t('errors.serverError'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-grid">
      <aside className="login-info">
        <div className="flex items-center gap-3">
          <span className="logo">М</span>
          <div>
            <strong>{t('brand')}</strong>
            <p className="text-xs muted mt-1">{t('product')}</p>
          </div>
        </div>
        <div className="max-w-md">
          <span className="eyebrow">{t('workspace')}</span>
          <h1 className="text-4xl leading-tight font-semibold tracking-tight mt-5">
            {t('tagline')}
          </h1>
          <p className="muted leading-7 mt-6">{t('overviewText')}</p>
          <div className="flex items-center gap-3 mt-10 text-xs muted">
            <ShieldCheck size={18} />
            {t('privacy')}
          </div>
        </div>
        <p className="text-xs muted">
          {t('brand')} · {t('local')}
        </p>
      </aside>
      <main className="flex flex-col min-h-screen">
        <div className="flex justify-end p-6">
          <Preferences {...{ locale, theme, setLocale, setTheme }} />
        </div>
        <div className="flex-1 flex items-center justify-center p-7">
          <div className="w-full max-w-sm">
            <div className="logo mb-7 md:hidden">М</div>
            <p className="eyebrow mb-3">{t('brand')}</p>
            <h2 className="text-2xl font-semibold tracking-tight">{t('signIn')}</h2>
            <p className="muted mt-2 text-sm">{t('product')}</p>
            <form onSubmit={submit} className="mt-8 space-y-5">
              <div>
                <label htmlFor="login">{t('login')}</label>
                <input id="login" name="login" autoComplete="username" required maxLength={80} />
              </div>
              <div>
                <label htmlFor="password">{t('password')}</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={256}
                />
              </div>
              {error && (
                <div role="alert" className="error">
                  {error}
                </div>
              )}
              <Button className="w-full" disabled={busy}>
                {busy ? t('loading') : t('signIn')}
                <ArrowRight size={16} />
              </Button>
            </form>
            <p className="muted text-xs mt-5">{t('accountNotice')}</p>
            <div className="surface rounded-md p-4 mt-10 text-xs muted leading-6">
              {t('demoNotice')}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
import { useApp } from './context';
function Shell({ error, success, clear }: { error: string; success: string; clear: () => void }) {
  const t = useTranslations();
  const { user, locale, theme, setLocale, setTheme, query, navigate, api, revision, refresh } =
    useApp();
  const view = query.get('view') || 'overview';
  const [menu, setMenu] = useState(false),
    [newOpen, setNewOpen] = useState(false),
    [notesOpen, setNotesOpen] = useState(false),
    [notes, setNotes] = useState<Notification[]>([]);
  useEffect(() => {
    if (user.mustChangePassword) return;
    const load = () =>
      api<Notification[]>('notifications')
        .then(setNotes)
        .catch(() => {});
    void load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [api, revision, user.mustChangePassword]);
  const nav = [
    ['overview', LayoutDashboard],
    ['appeals', ClipboardList],
    ['results', CheckCircle2],
    ['analytics', ChartNoAxesCombined],
    ['settings', Settings],
  ] as const;
  return (
    <>
      <a href="#main" className="skip-link">
        {t('workspace')}
      </a>
      {menu && (
        <button
          className="fixed inset-0 bg-black/30 z-30 md:hidden"
          aria-label={t('close')}
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar flex flex-col ${menu ? 'open' : ''}`}>
        <div className="p-6 flex items-center gap-3">
          <span className="logo">М</span>
          <div>
            <div className="font-bold tracking-tight">{t('brand')}</div>
            <div className="text-[10px] muted mt-1">{t('product')}</div>
          </div>
        </div>
        <div className="px-6 pt-7 pb-3 eyebrow">{t('workspace')}</div>
        <nav className="px-3 space-y-1">
          {nav.map(([key, Icon]) => (
            <button
              key={key}
              className={`navitem ${view === key ? 'selected' : ''}`}
              aria-current={view === key ? 'page' : undefined}
              onClick={() => {
                navigate({ view: key });
                setMenu(false);
              }}
            >
              <Icon size={18} />
              {t(key)}
            </button>
          ))}
        </nav>
        <div className="mt-auto p-4">
          <div className="surface p-4 rounded-lg mb-5">
            <MessageSquare size={20} className="text-blue-600 mb-3" />
            <p className="text-xs leading-5 muted">{t('overviewText')}</p>
          </div>
          <div className="flex gap-3 items-center border-t pt-5">
            <div className="rounded-full surface w-9 h-9 grid place-items-center font-semibold text-blue-600">
              {user.name[0]}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate">{user.name}</p>
              <p className="text-[10px] muted mt-1">{t(`roles.${user.role}`)}</p>
            </div>
            <button
              title={t('signOut')}
              aria-label={t('signOut')}
              onClick={() => void signOutLocally()}
            >
              <LogOut size={16} className="muted" />
            </button>
          </div>
        </div>
      </aside>
      <div className="main min-h-screen surface">
        <header className="h-[72px] bg-background border-b flex items-center justify-between px-4 md:px-10">
          <div className="flex gap-3 items-center">
            <Button
              variant="ghost"
              size="icon"
              className="mobile-menu"
              aria-label={t('menu')}
              onClick={() => setMenu(!menu)}
            >
              <Menu size={20} />
            </Button>
            <span className="header-crumb muted text-xs">{t('workspace')}</span>
            <ChevronRight size={13} className="muted header-crumb" />
            <span className="text-xs font-medium">
              {t(nav.some(([k]) => k === view) ? view : 'appeals')}
            </span>
          </div>
          <div className="flex gap-2 items-center">
            <Preferences {...{ locale, theme, setLocale, setTheme }} />
            {!user.mustChangePassword && (
              <Button
                variant="ghost"
                size="icon"
                className="relative"
                aria-label={t('notifications')}
                onClick={() => setNotesOpen(!notesOpen)}
              >
                <Bell size={18} />
                {notes.some((n) => !n.readAt) && (
                  <span className="absolute right-2 top-2 w-1.5 h-1.5 rounded-full bg-blue-600" />
                )}
              </Button>
            )}
          </div>
        </header>
        <main id="main" className="content">
          {(error || success) && (
            <div
              className={`${error ? 'error' : 'success'} mb-6 flex justify-between gap-3`}
              role={error ? 'alert' : 'status'}
            >
              <div>
                {error
                  ? t.has(`errors.${error}`)
                    ? t(`errors.${error}`)
                    : t('errors.serverError')
                  : success}
                {error === 'conflict' && (
                  <Button
                    className="ml-3"
                    size="sm"
                    onClick={() => {
                      refresh();
                      clear();
                    }}
                  >
                    {t('refresh')}
                  </Button>
                )}
              </div>
              <button aria-label={t('close')} onClick={clear}>
                <X size={16} />
              </button>
            </div>
          )}
          {user.mustChangePassword ? (
            <div className="max-w-lg mx-auto mt-12 panel p-7">
              <h1 className="page-title mb-3">{t('changePassword')}</h1>
              <p className="muted mb-6">{t('forcePassword')}</p>
              <PasswordForm />
            </div>
          ) : query.get('id') ? (
            <AppealDetail id={query.get('id')!} />
          ) : view === 'settings' ? (
            <SettingsScreen />
          ) : view === 'analytics' ? (
            <AnalyticsScreen />
          ) : view === 'appeals' || view === 'results' ? (
            <AppealList results={view === 'results'} onNew={() => setNewOpen(true)} />
          ) : (
            <Overview onNew={() => setNewOpen(true)} />
          )}
        </main>
      </div>
      {newOpen && <NewAppeal close={() => setNewOpen(false)} />}{' '}
      {notesOpen && (
        <div className="fixed z-50 top-[64px] right-3 md:right-8 w-[min(400px,calc(100vw-24px))] panel shadow-xl max-h-[80vh] overflow-auto">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="font-semibold">{t('notifications')}</h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('close')}
              onClick={() => setNotesOpen(false)}
            >
              <X size={17} />
            </Button>
          </div>
          <Button
            variant="ghost"
            className="m-2"
            onClick={async () => {
              await api('notifications', {});
              refresh();
            }}
          >
            <CheckCheck size={16} />
            {t('markAll')}
          </Button>
          {!notes.length && <p className="p-6 muted">{t('empty')}</p>}
          {notes.map((n) => (
            <button
              key={n.id}
              className={`block w-full text-left border-t p-4 ${!n.readAt ? 'surface' : ''}`}
              onClick={async () => {
                await api('notifications', { id: n.id });
                setNotesOpen(false);
                navigate({ view: 'appeals', id: n.appeal.id });
                refresh();
              }}
            >
              <p className="text-xs text-blue-600">
                {t(`events.${n.kind}`)} · {num(n.appeal.number)}
              </p>
              <p className="text-sm mt-2 line-clamp-2">{n.appeal.title}</p>
              <p className="text-[10px] muted mt-2">{date(n.createdAt, locale, true)}</p>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
