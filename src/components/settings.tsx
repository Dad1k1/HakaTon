'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { TelegramSettings } from './telegram-settings';
import { AvatarUpload } from './avatar-upload';
import { Avatar } from './ui/avatar';
import { Plus, Shield, Users } from './ui/icons';
import { departmentName } from './context';
import { Button } from './ui/button';
import { signOutLocally } from '@/lib/session-client';
import { useApp, useLoad, type User, type Category } from './context';
export function PasswordForm() {
  const t = useTranslations();
  const { api, setError } = useApp();
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const f = new FormData(e.currentTarget);
      await api('password', Object.fromEntries(f));
      await signOutLocally();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="old-password">{t('currentPassword')}</label>
        <input
          id="old-password"
          type="password"
          name="currentPassword"
          required
          autoComplete="current-password"
          maxLength={256}
        />
      </div>
      <div>
        <label htmlFor="new-password">{t('newPassword')}</label>
        <input
          id="new-password"
          type="password"
          name="newPassword"
          minLength={4}
          maxLength={256}
          required
          autoComplete="new-password"
        />
        <p className="muted text-xs mt-2 leading-6">{t('passwordHint')}</p>
      </div>
      <Button disabled={busy}>{busy ? t('loading') : t('changePassword')}</Button>
    </form>
  );
}
export function SettingsScreen() {
  const t = useTranslations();
  const { user, api, notice, setError, refresh, locale, setLocale, theme, setTheme } = useApp();
  const [section, setSection] = useState('profile');
  async function profile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const f = new FormData(e.currentTarget);
      await api('profile', { name: f.get('name') });
      notice(t('saved'));
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <h1 className="page-title mb-7">{t('settings')}</h1>
      <div className="motion-track settings-tabs flex gap-2 flex-wrap mb-6">
        {['profile', 'changePassword', ...(user.role === 'ADMIN' ? ['administration'] : [])].map(
          (key) => (
            <Button
              key={key}
              aria-pressed={section === key}
              variant={section === key ? 'default' : 'outline'}
              onClick={() => setSection(key)}
            >
              {t(key)}
            </Button>
          ),
        )}
      </div>
      <div className="settings-layout">
        <section hidden={section !== 'profile'} className="panel p-6 profile-panel">
          <h2 className="font-semibold mb-5">{t('profile')}</h2>
          <AvatarUpload />
          <form onSubmit={profile} className="space-y-4">
            <div>
              <label htmlFor="profile-name">{t('name')}</label>
              <input
                id="profile-name"
                name="name"
                defaultValue={user.name}
                required
                maxLength={120}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label>{t('login')}</label>
                <p className="text-sm">{user.login}</p>
              </div>
              <div>
                <label>{t('role')}</label>
                <p className="text-sm">{t(`roles.${user.role}`)}</p>
              </div>
            </div>
            <Button>{t('save')}</Button>
          </form>
          <hr className="my-6" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="profile-language">{t('language')}</label>
              <select
                id="profile-language"
                value={locale}
                onChange={(e) => setLocale(e.target.value as 'ru' | 'kk' | 'en')}
              >
                <option value="ru">Русский</option>
                <option value="kk">Қазақша</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label htmlFor="profile-theme">{t('theme')}</label>
              <select
                id="profile-theme"
                value={theme}
                onChange={(e) => setTheme(e.target.value as 'light' | 'dark')}
              >
                <option value="light">{t('light')}</option>
                <option value="dark">{t('dark')}</option>
              </select>
            </div>
          </div>
          <TelegramSettings />
        </section>
        <section hidden={section !== 'changePassword'} className="panel p-6">
          <h2 className="font-semibold mb-5">{t('changePassword')}</h2>
          <PasswordForm />
        </section>
        <aside className="panel settings-summary" hidden={section === 'administration'}>
          <div className="profile-avatar">
            <Avatar person={user} />
          </div>
          <h2 className="text-xl font-semibold">{user.name}</h2>
          <p className="muted mt-2">{t(`roles.${user.role}`)}</p>
          <dl className="space-y-5 mt-8">
            <div>
              <dt className="eyebrow">{t('department')}</dt>
              <dd className="mt-2">{departmentName(user.department?.name || '—', locale)}</dd>
            </div>
            <div>
              <dt className="eyebrow">{t('login')}</dt>
              <dd className="mt-2">{user.login}</dd>
            </div>
          </dl>
          <div className="surface rounded-2xl p-5 mt-8">
            <Shield size={23} />
            <p className="text-xs muted leading-6 mt-3">{t('passwordHint')}</p>
          </div>
        </aside>
      </div>
      {user.role === 'ADMIN' && (
        <div hidden={section !== 'administration'}>
          <Admin />
        </div>
      )}
    </>
  );
}
type Config = {
  categories: Category[];
  departments: { id: string; name: string }[];
  rules: {
    id: string;
    category: Category;
    department: { name: string } | null;
    assignee: { name: string; blocked: boolean };
  }[];
  sla: { LOW: number; MEDIUM: number; HIGH: number };
};
function Admin() {
  const t = useTranslations();
  const { api, refresh, notice, setError, locale } = useApp();
  const { data: users } = useLoad<User[]>('admin/users');
  const { data: config } = useLoad<Config>('admin/config');
  const [tab, setTab] = useState('users'),
    [showDeleted, setShowDeleted] = useState(false),
    [edit, setEdit] = useState<User | null>(null),
    [busy, setBusy] = useState(false);
  async function mutate(p: string, body: unknown) {
    setBusy(true);
    try {
      await api('admin/' + p, body);
      refresh();
      notice(t('saved'));
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const field = (name: string, label: string, type = 'text', required = true) => (
    <div>
      <label htmlFor={'admin-' + name}>{label}</label>
      <input id={'admin-' + name} name={name} type={type} required={required} maxLength={256} />
    </div>
  );
  const departments = (name = 'departmentId', value = '', optional = false) => (
    <div>
      <label htmlFor={'admin-' + name}>{t('department')}</label>
      <select id={'admin-' + name} name={name} defaultValue={value} required={!optional}>
        <option value="">{optional ? t('all') : '—'}</option>
        {config?.departments.map((d) => (
          <option value={d.id} key={d.id}>
            {departmentName(d.name, locale)}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold flex items-center gap-2 mb-5">
        <Shield size={20} />
        {t('administration')}
      </h2>
      <div className="motion-track settings-tabs flex gap-2 flex-wrap mb-6" role="tablist">
        {['users', 'directory', 'routing', 'sla'].map((k) => (
          <Button
            key={k}
            role="tab"
            aria-selected={tab === k}
            variant={tab === k ? 'default' : 'outline'}
            onClick={() => setTab(k)}
          >
            {t(k)}
          </Button>
        ))}
      </div>
      {!users || !config ? (
        <p className="muted">{t('loading')}</p>
      ) : (
        <>
          {tab === 'users' && (
            <div className="space-y-6">
              <div className="panel p-6">
                <h3 className="font-semibold mb-5">{edit ? t('editUser') : t('createUser')}</h3>
                <form
                  key={edit?.id || 'new'}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const f = new FormData(form);
                    const b = Object.fromEntries(f) as Record<string, unknown>;
                    if (edit) {
                      if (!b.password) delete b.password;
                      if (await mutate('users/' + edit.id, b)) setEdit(null);
                    } else if (await mutate('users', b)) form.reset();
                  }}
                  className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
                >
                  {!edit && field('login', t('login'))}
                  <div>
                    <label htmlFor="admin-user-name">{t('name')}</label>
                    <input
                      id="admin-user-name"
                      name="name"
                      required
                      defaultValue={edit?.name || ''}
                      maxLength={120}
                    />
                  </div>
                  <div>
                    <label htmlFor="admin-role">{t('role')}</label>
                    <select id="admin-role" name="role" defaultValue={edit?.role || 'EMPLOYEE'}>
                      {['EMPLOYEE', 'RESPONSIBLE', 'MANAGER', 'ADMIN'].map((v) => (
                        <option value={v} key={v}>
                          {t(`roles.${v}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  {departments('departmentId', edit?.departmentId)}
                  <div>
                    <label htmlFor="admin-password">
                      {t(edit ? 'resetPassword' : 'temporaryPassword')}
                    </label>
                    <input
                      id="admin-password"
                      name="password"
                      type="password"
                      minLength={4}
                      maxLength={256}
                      required={!edit}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="flex gap-2 items-end">
                    <Button disabled={busy}>{t(edit ? 'save' : 'createUser')}</Button>
                    {edit && (
                      <Button variant="outline" type="button" onClick={() => setEdit(null)}>
                        {t('cancel')}
                      </Button>
                    )}
                  </div>
                </form>
              </div>
              <label className="flex items-center gap-2">
                <input
                  className="!w-auto"
                  type="checkbox"
                  checked={showDeleted}
                  onChange={(e) => setShowDeleted(e.target.checked)}
                />
                {t('showDeleted')}
              </label>
              <div className="panel divide-y">
                {users
                  .filter((u) => showDeleted || !u.deletedAt)
                  .map((u) => (
                    <div
                      className="p-4 flex flex-wrap gap-4 justify-between items-center"
                      key={u.id}
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {u.name} <span className="badge ml-2">{t(`roles.${u.role}`)}</span>
                        </p>
                        <p className="text-xs muted mt-2">
                          {u.login} · {departmentName(u.department?.name || '', locale)} ·{' '}
                          {t(u.deletedAt ? 'deleted' : u.blocked ? 'blocked' : 'active')}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!u.deletedAt}
                          onClick={() => {
                            setEdit(u);
                            setTimeout(
                              () => document.getElementById('admin-user-name')?.focus(),
                              0,
                            );
                          }}
                        >
                          {t('editUser')}
                        </Button>
                        <Button
                          disabled={busy}
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            mutate(
                              'users/' + u.id,
                              u.deletedAt ? { deleted: false } : { blocked: !u.blocked },
                            )
                          }
                        >
                          {t(u.deletedAt ? 'restoreUser' : u.blocked ? 'unblock' : 'block')}
                        </Button>
                        {!u.deletedAt && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              if (window.confirm(t('confirmDeleteUser')))
                                void mutate('users/' + u.id, { deleted: true });
                            }}
                          >
                            {t('deleteUser')}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
          {tab === 'directory' && (
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="panel p-6">
                <h3 className="font-semibold mb-5">{t('department')}</h3>
                <form
                  className="flex gap-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    await mutate('departments', Object.fromEntries(new FormData(form)));
                    form.reset();
                  }}
                >
                  <input aria-label={t('name')} name="name" required maxLength={120} />
                  <Button disabled={busy}>{t('add')}</Button>
                </form>
                <div className="mt-5 space-y-3">
                  {config.departments.map((d) => (
                    <p className="text-xs" key={d.id}>
                      {departmentName(d.name, locale)}
                    </p>
                  ))}
                </div>
              </div>
              <div className="panel p-6">
                <h3 className="font-semibold mb-5">{t('category')}</h3>
                <form
                  className="space-y-4"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    await mutate('categories', Object.fromEntries(new FormData(form)));
                    form.reset();
                  }}
                >
                  {field('code', t('code'))}
                  {field('ru', 'Русский')}
                  {field('kk', 'Қазақша')}
                  {field('en', 'English')}
                  <Button disabled={busy}>{t('save')}</Button>
                </form>
                <div className="mt-5 space-y-3">
                  {config.categories.map((c) => (
                    <div
                      key={c.id}
                      className="text-xs flex justify-between gap-3 items-center border-t pt-3"
                    >
                      <span>
                        {c[locale]} <span className="muted">({c.code})</span>
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          mutate('categories', {
                            code: c.code,
                            ru: c.ru,
                            kk: c.kk,
                            en: c.en,
                            active: !c.active,
                          })
                        }
                      >
                        {t(c.active ? 'active' : 'disabled')}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {tab === 'routing' && (
            <div className="panel p-6">
              <h3 className="font-semibold mb-5">{t('routing')}</h3>
              <form
                className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const b = Object.fromEntries(f);
                  await mutate('rules', { ...b, departmentId: b.departmentId || null });
                }}
              >
                <div>
                  <label htmlFor="admin-category">{t('category')}</label>
                  <select id="admin-category" name="categoryId" required>
                    {config.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c[locale]}
                      </option>
                    ))}
                  </select>
                </div>
                {departments('departmentId', '', true)}
                <div>
                  <label htmlFor="admin-assignee">{t('assignee')}</label>
                  <select id="admin-assignee" name="assigneeId" required>
                    {users
                      .filter((u) => !u.blocked && u.role !== 'EMPLOYEE')
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <Button disabled={busy}>{t('save')}</Button>
                </div>
              </form>
              <div className="divide-y mt-6">
                {config.rules.map((r) => (
                  <div className="py-4 flex justify-between gap-4" key={r.id}>
                    <div>
                      <p className="text-sm">{r.category[locale]}</p>
                      <p className="text-xs muted mt-2">
                        {r.department ? departmentName(r.department.name, locale) : t('all')} →{' '}
                        {r.assignee.name}
                        {r.assignee.blocked && ' · ' + t('blocked')}
                      </p>
                    </div>
                    <Button
                      disabled={busy}
                      size="sm"
                      variant="ghost"
                      onClick={() => mutate('rule-delete', { id: r.id })}
                    >
                      {t('delete')}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab === 'sla' && (
            <div className="panel p-6 max-w-xl">
              <h3 className="font-semibold mb-3">{t('sla')}</h3>
              <p className="muted text-xs mb-5 leading-6">{t('slaHint')}</p>
              <form
                className="space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  await mutate('sla', Object.fromEntries([...f].map(([k, v]) => [k, Number(v)])));
                }}
              >
                {['HIGH', 'MEDIUM', 'LOW'].map((p) => (
                  <div key={p}>
                    <label htmlFor={'sla-' + p}>{t(`priorities.${p}`)}</label>
                    <input
                      id={'sla-' + p}
                      name={p}
                      type="number"
                      min={1}
                      max={365}
                      defaultValue={config.sla[p as 'HIGH']}
                      required
                    />
                  </div>
                ))}
                <Button disabled={busy}>{t('save')}</Button>
              </form>
            </div>
          )}
        </>
      )}
    </section>
  );
}
