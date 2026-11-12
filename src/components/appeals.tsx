'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Inbox,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from './ui/icons';
import type { Status } from '@prisma/client';
import { departmentName } from './context';
import { Button } from './ui/button';
import { useApp, useLoad, num, date, type Appeal, type Analytics, type History } from './context';
import { terminal, transitions } from '@/lib/domain';
import { OverviewCharts } from './overview-charts';
export function Badge({ value, kind = 'statuses' }: { value: string; kind?: string }) {
  const t = useTranslations();
  return (
    <span className={`badge ${value}`}>
      {kind === 'statuses' && <span className="w-1 h-1 rounded-full bg-current" />}
      {t(`${kind}.${value}`)}
    </span>
  );
}
function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
      <div>
        <h1 className="page-title">{title}</h1>
        {description && <p className="muted text-xs mt-2 leading-6">{description}</p>}
      </div>
      {children}
    </div>
  );
}
function Loading() {
  const t = useTranslations();
  return (
    <div className="loading-skeleton p-6 space-y-5" role="status" aria-label={t('loading')}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-4">
          <span className="skeleton w-10 h-10 rounded-xl" />
          <div className="flex-1 space-y-3">
            <div className="skeleton h-4 w-3/4 rounded-full" />
            <div className="skeleton h-3 w-1/2 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
function Empty() {
  const t = useTranslations();
  return (
    <div className="py-16 px-5 text-center">
      <Inbox size={32} className="mx-auto muted mb-4" />
      <p className="font-medium">{t('empty')}</p>
      <p className="text-xs muted mt-3">{t('emptyHint')}</p>
    </div>
  );
}
function Stat({
  label,
  value,
  icon: Icon,
  note,
  onClick,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  icon: typeof Inbox;
  note?: string;
  onClick?: () => void;
  tone?: 'default' | 'alert' | 'success';
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`panel stat-card p-5 md:p-6 text-left stat-${tone}`} onClick={onClick}>
      <div className="flex justify-between items-center gap-3">
        <span className="muted text-xs">{label}</span>
        <Icon size={17} className="muted" />
      </div>
      <p className="stat-value text-[30px] font-semibold tracking-tight mt-4">{value}</p>
      {note && <p className="text-[10px] muted mt-2">{note}</p>}
    </Tag>
  );
}
function Activity({ items }: { items: History[] }) {
  const { locale, navigate } = useApp();
  const t = useTranslations();
  return (
    <div className="panel activity-panel">
      <div className="p-5 border-b flex gap-2 items-center">
        <Clock size={16} className="muted" />
        <h2 className="font-semibold text-sm">{t('recent')}</h2>
      </div>
      {!items.length ? (
        <Empty />
      ) : (
        items.map((h, i) => (
          <button
            onClick={() => h.appeal && navigate({ view: 'appeals', id: h.appeal.id })}
            key={h.id}
            className="flex gap-3 p-5 border-b last:border-0 w-full text-left"
          >
            <div className="flex flex-col items-center">
              <div className="w-7 h-7 surface rounded-full grid place-items-center">
                <MessageSquare size={12} className="muted" />
              </div>
              {i < items.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium">{t(`events.${h.action}`)}</p>
              <p className="text-xs muted mt-1 line-clamp-2">
                {h.appeal && num(h.appeal.number) + ' · '}
                {h.appeal?.title}
              </p>
              <p className="text-[10px] muted mt-2">
                {h.actor.name} · {date(h.createdAt, locale, true)}
              </p>
            </div>
          </button>
        ))
      )}
    </div>
  );
}
export function Overview({ onNew }: { onNew: () => void }) {
  const { user, navigate, locale } = useApp();
  const t = useTranslations();
  const { data: a } = useLoad<Analytics>('analytics');
  const { data: list } = useLoad<{ items: Appeal[] }>('appeals');
  return (
    <>
      <p className="eyebrow mb-3">{t('product')}</p>
      <PageHeading title={t('welcome')} description={t('overviewText')}>
        <Button onClick={onNew} data-tour="create">
          <Plus size={16} />
          {t('newAppeal')}
        </Button>
      </PageHeading>
      <div className="stats mb-7">
        <Stat
          label={t('total')}
          value={a?.total ?? '—'}
          icon={FileText}
          note={t('available')}
          onClick={() => navigate({ view: 'appeals' })}
        />
        <Stat
          label={t('awaitingResponse')}
          value={a?.awaitingResponse ?? '—'}
          icon={Clock}
          note={t('awaitingResponseHint')}
          onClick={() => navigate({ view: 'appeals', awaitingResponse: 'true' })}
        />
        <Stat
          label={t('overdue')}
          tone="alert"
          value={a?.overdue ?? '—'}
          icon={ArrowUpRight}
          note={t('onlyOverdue')}
          onClick={() => navigate({ view: 'appeals', overdue: 'true' })}
        />
        <Stat
          label={t(user.role === 'ADMIN' ? 'unassigned' : 'implemented')}
          tone={user.role === 'ADMIN' ? 'default' : 'success'}
          value={a ? (user.role === 'ADMIN' ? a.unassigned : a.implemented) : '—'}
          icon={user.role === 'ADMIN' ? Inbox : CheckCircle2}
          note={t(user.role === 'ADMIN' ? 'assignee' : 'results')}
          onClick={() =>
            navigate(
              user.role === 'ADMIN'
                ? { view: 'appeals', assigneeId: 'unassigned' }
                : { view: 'results', status: 'IMPLEMENTED' },
            )
          }
        />
      </div>
      <OverviewCharts analytics={a} />
      <div className="grid xl:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start overview-columns">
        <section className="panel min-w-0 overflow-hidden" data-testid="latest-appeals">
          <div className="p-5 border-b flex justify-between items-center gap-3">
            <h2 className="font-semibold">{t('latest')}</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate({ view: 'appeals' })}>
              {t('allAppeals')}
              <ArrowRight size={14} />
            </Button>
          </div>
          {!list ? (
            <Loading />
          ) : !list.items.length ? (
            <Empty />
          ) : (
            <div className="divide-y">
              {list.items.slice(0, 5).map((a) => (
                <button
                  onClick={() => navigate({ view: 'appeals', id: a.id })}
                  className="appeal-row p-5 w-full text-left flex gap-4 items-start"
                  key={a.id}
                >
                  <div className="w-9 h-9 surface rounded-md grid place-items-center text-blue-600">
                    <FileText size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-[10px] muted font-medium">{num(a.number)}</span>
                      <Badge value={a.status} />
                    </div>
                    <p className="text-sm font-medium mt-2 line-clamp-2">{a.title}</p>
                    <p className="text-[11px] muted mt-2">
                      {a.category[locale]} · {departmentName(a.department.name, locale)}
                    </p>
                  </div>
                  <ChevronRight size={15} className="muted mt-2" />
                </button>
              ))}
            </div>
          )}
        </section>
        <Activity items={a?.recent ?? []} />
      </div>
    </>
  );
}
function dateInput(s: string | null) {
  if (!s) return '';
  const d = new Date(s);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export function Filters({ results = false }: { results?: boolean }) {
  const { query, navigate, lookups, locale } = useApp();
  const t = useTranslations();
  const [search, setSearch] = useState(query.get('q') || '');
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setSearch(query.get('q') || ''), [query]);
  function update(k: string, v: string) {
    const q = new URLSearchParams(query);
    if (v) q.set(k, v);
    else q.delete(k);
    q.delete('page');
    navigate(Object.fromEntries(q));
  }
  const select = (key: string, label: string, opts: [string, string][]) => (
    <div key={key}>
      <label htmlFor={'filter-' + key}>{label}</label>
      <select
        id={'filter-' + key}
        value={query.get(key) || ''}
        onChange={(e) => update(key, e.target.value)}
      >
        <option value="">{t('all')}</option>
        {opts.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <div className="panel p-4 mb-5">
      <div className="flex gap-3 flex-wrap">
        <form
          className="flex-1 flex items-center relative min-w-[180px]"
          onSubmit={(e) => {
            e.preventDefault();
            update('q', search);
          }}
        >
          <Search size={16} className="absolute left-3 muted" />
          <input
            aria-label={t('search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search')}
            className="!pl-10 !pr-12"
          />
          <button className="absolute right-3 text-blue-600" aria-label={t('search')}>
            <ArrowRight size={16} />
          </button>
        </form>
        <Button variant="outline" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
          <SlidersHorizontal size={15} />
          {t('filters')}
          {[...query.keys()].filter((k) => !['view', 'page', 'id'].includes(k)).length > 0 && (
            <span className="w-2 h-2 rounded-full bg-blue-600" />
          )}
        </Button>
        <Button variant="ghost" onClick={() => navigate({ view: query.get('view') || 'appeals' })}>
          {t('reset')}
        </Button>
      </div>
      {expanded && (
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {select(
            'type',
            t('type'),
            ['PROBLEM', 'SUGGESTION', 'PRAISE'].map((v) => [v, t(`types.${v}`)]),
          )}
          {select(
            'status',
            t('status'),
            (results ? terminal : Object.keys(transitions)).map((v) => [v, t(`statuses.${v}`)]),
          )}
          {select(
            'priority',
            t('priority'),
            ['LOW', 'MEDIUM', 'HIGH'].map((v) => [v, t(`priorities.${v}`)]),
          )}
          {select(
            'categoryId',
            t('category'),
            lookups.categories.map((c) => [c.id, c[locale]]),
          )}
          {select(
            'departmentId',
            t('department'),
            lookups.departments.map((c) => [c.id, departmentName(c.name, locale)]),
          )}
          {select('assigneeId', t('assignee'), [
            ['unassigned', t('unassigned')],
            ...lookups.users
              .filter((u) => u.role !== 'EMPLOYEE')
              .map((u) => [u.id, u.name] as [string, string]),
          ])}
          {select(
            'sort',
            t('sort'),
            ['createdAt', 'number', 'dueAt', 'priority', 'status', 'title'].map((k) => [k, t(k)]),
          )}
          {select('order', t('order'), [
            ['asc', t('asc')],
            ['desc', t('desc')],
          ])}
          <div>
            <label htmlFor="due-from">{t('dueFrom')}</label>
            <input
              id="due-from"
              type="date"
              value={dateInput(query.get('dueFrom'))}
              onChange={(e) =>
                update(
                  'dueFrom',
                  e.target.value ? new Date(e.target.value + 'T00:00:00').toISOString() : '',
                )
              }
            />
          </div>
          <div>
            <label htmlFor="due-to">{t('dueTo')}</label>
            <input
              id="due-to"
              type="date"
              value={dateInput(query.get('dueTo'))}
              onChange={(e) =>
                update(
                  'dueTo',
                  e.target.value ? new Date(e.target.value + 'T23:59:59.999').toISOString() : '',
                )
              }
            />
          </div>
          <label className="flex gap-3 items-center pt-5">
            <input
              type="checkbox"
              checked={query.get('overdue') === 'true'}
              onChange={(e) => update('overdue', e.target.checked ? 'true' : '')}
            />
            {t('onlyOverdue')}
          </label>
        </div>
      )}
    </div>
  );
}
export function AppealList({ results, onNew }: { results: boolean; onNew: () => void }) {
  const t = useTranslations();
  const { query, navigate, locale } = useApp();
  const q = new URLSearchParams(query);
  if (results) q.set('completed', 'true');
  const { data, loading } = useLoad<{
    items: Appeal[];
    total: number;
    page: number;
    pageSize: number;
  }>('appeals?' + q.toString());
  function page(p: number) {
    const q = new URLSearchParams(query);
    q.set('page', String(p));
    navigate(Object.fromEntries(q));
  }
  const overdue = (a: Appeal) => new Date(a.dueAt) < new Date() && !terminal.includes(a.status);
  return (
    <>
      <PageHeading
        title={t(results ? 'results' : 'appeals')}
        description={t(results ? 'resultsText' : 'available')}
      >
        {!results && (
          <Button onClick={onNew} data-tour="create">
            <Plus size={16} />
            {t('newAppeal')}
          </Button>
        )}
      </PageHeading>
      <Filters results={results} />
      {loading ? (
        <Loading />
      ) : !data?.items.length ? (
        <div className="panel">
          <Empty />
        </div>
      ) : (
        <>
          <div className="panel desktop-table thin-scroll">
            <table>
              <thead>
                <tr>
                  <th>
                    {t('number')} / {t('title')}
                  </th>
                  <th>
                    {t('type')} / {t('category')}
                  </th>
                  <th>{t('department')}</th>
                  <th>
                    {t('status')} / {t('priority')}
                  </th>
                  <th>{t('assignee')}</th>
                  <th>{t('dueAt')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.id}>
                    <td className="min-w-[210px] max-w-[340px]">
                      <a
                        className="block hover:text-blue-600"
                        href={'/?view=appeals&id=' + a.id}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate({ view: 'appeals', id: a.id });
                        }}
                      >
                        <span className="text-[10px] muted">{num(a.number)}</span>
                        <p className="text-xs font-medium mt-2 line-clamp-2">{a.title}</p>
                        {results && <p className="text-xs muted mt-2 line-clamp-2">{a.result}</p>}
                      </a>
                    </td>
                    <td>
                      <div className="text-[11px]">{t(`types.${a.type}`)}</div>
                      <div className="text-[10px] muted mt-2">{a.category[locale]}</div>
                    </td>
                    <td className="text-[11px]">{departmentName(a.department.name, locale)}</td>
                    <td>
                      <Badge value={a.status} />
                      <div className="mt-2 text-[10px] muted">{t(`priorities.${a.priority}`)}</div>
                    </td>
                    <td className="text-[11px]">{a.assignee?.name || t('unassigned')}</td>
                    <td
                      className={`text-[10px] whitespace-nowrap ${overdue(a) ? 'text-red-600' : 'muted'}`}
                    >
                      {date(a.dueAt, locale)}
                      {overdue(a) && <p className="mt-1">{t('overdue')}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mobile-cards">
            {data.items.map((a) => (
              <a
                href={'/?view=appeals&id=' + a.id}
                onClick={(e) => {
                  e.preventDefault();
                  navigate({ view: 'appeals', id: a.id });
                }}
                className="panel p-4"
                key={a.id}
              >
                <div className="flex justify-between gap-2">
                  <span className="text-xs muted">{num(a.number)}</span>
                  <Badge value={a.status} />
                </div>
                <h2 className="font-medium text-sm my-3">{a.title}</h2>
                <p className="text-xs muted">
                  {t(`types.${a.type}`)} · {a.category[locale]}
                </p>
                <dl className="grid grid-cols-2 gap-3 mt-4 text-xs">
                  <div>
                    <dt className="muted">{t('department')}</dt>
                    <dd className="mt-1">{departmentName(a.department.name, locale)}</dd>
                  </div>
                  <div>
                    <dt className="muted">{t('assignee')}</dt>
                    <dd className="mt-1">{a.assignee?.name || t('unassigned')}</dd>
                  </div>
                  <div>
                    <dt className="muted">{t('priority')}</dt>
                    <dd className="mt-1">{t(`priorities.${a.priority}`)}</dd>
                  </div>
                  <div>
                    <dt className="muted">{t('dueAt')}</dt>
                    <dd className={overdue(a) ? 'text-red-600 mt-1' : 'mt-1'}>
                      {date(a.dueAt, locale)}
                      {overdue(a) && ' · ' + t('overdue')}
                    </dd>
                  </div>
                </dl>
                {results && <p className="text-xs text-content mt-4">{a.result}</p>}
              </a>
            ))}
          </div>
          <div className="flex items-center justify-between mt-5 text-xs muted">
            <span>
              {t('page')} {data.page} {t('of')} {Math.max(1, Math.ceil(data.total / data.pageSize))}{' '}
              · {data.total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={data.page <= 1}
                onClick={() => page(data.page - 1)}
                aria-label={t('back')}
              >
                <ChevronLeft size={15} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={data.page * data.pageSize >= data.total}
                onClick={() => page(data.page + 1)}
                aria-label={t('next')}
              >
                <ChevronRight size={15} />
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
export function AnalyticsScreen() {
  const t = useTranslations();
  const { query, lookups, locale } = useApp();
  const { data: a, loading } = useLoad<Analytics>('analytics?' + query.toString());
  const chart = (label: string, items: Record<string, number>, name: (k: string) => string) => (
    <section className="panel p-6" key={label}>
      <h2 className="font-semibold mb-6">{label}</h2>
      {!Object.keys(items).length ? (
        <p className="muted">{t('noData')}</p>
      ) : (
        <div className="space-y-5">
          {Object.entries(items).map(([k, v]) => (
            <div key={k}>
              <div className="flex justify-between text-xs mb-2 gap-3">
                <span>{name(k)}</span>
                <span className="muted">{v}</span>
              </div>
              <div
                className="bar"
                role="meter"
                aria-label={name(k)}
                aria-valuenow={v}
                aria-valuemin={0}
                aria-valuemax={a?.total || 1}
              >
                <div style={{ width: (100 * v) / (a?.total || 1) + '%' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
  return (
    <>
      <PageHeading title={t('analytics')} description={t('analyticsText')} />
      <Filters />
      {loading || !a ? (
        <Loading />
      ) : (
        <>
          <div className="stats mb-6">
            <Stat
              label={t('completedRate')}
              value={
                a.completedRate === null
                  ? t('noData')
                  : new Intl.NumberFormat(locale, {
                      style: 'percent',
                      maximumFractionDigits: 1,
                    }).format(a.completedRate)
              }
              icon={CheckCircle2}
            />
            <Stat
              label={t('implemented')}
              value={a.implemented}
              icon={ArrowUpRight}
              tone="success"
            />
            <Stat label={t('overdue')} value={a.overdue} icon={Clock} tone="alert" />
            <Stat
              label={t('firstResponse')}
              value={
                a.firstResponseHours === null
                  ? t('noData')
                  : new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
                      a.firstResponseHours,
                    ) +
                    ' ' +
                    t('hours')
              }
              icon={ArrowDownRight}
            />
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            {chart(t('byStatus'), a.byStatus, (k) => t(`statuses.${k}`))}
            {chart(t('byType'), a.byType, (k) => t(`types.${k}`))}
            {chart(
              t('byCategory'),
              a.byCategory,
              (k) => lookups.categories.find((c) => c.id === k)?.[locale] || k,
            )}
            <section className="panel p-6">
              <h2 className="font-semibold">{t('themes')}</h2>
              <p className="text-xs muted mt-2 mb-6 leading-6">{t('themesHint')}</p>
              {a.themes.length ? (
                <div className="flex gap-2 flex-wrap">
                  {a.themes.map(([word, n]) => (
                    <span key={word} className="badge">
                      {word} · {n}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="muted">{t('noData')}</p>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
export function NewAppeal({ close }: { close: () => void }) {
  const t = useTranslations();
  const { lookups, locale, api, refresh, navigate, setError } = useApp();
  const [busy, setBusy] = useState(false),
    [files, setFiles] = useState<File[]>([]),
    [localError, setLocalError] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.querySelector<HTMLInputElement>('input')?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) close();
      if (e.key === 'Tab') {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,textarea',
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [close, busy]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setLocalError('');
    try {
      if (files.length > 5) throw new Error('fileCount');
      if (files.some((f) => f.size > 10 * 1024 * 1024)) throw new Error('fileSize');
      const f = new FormData(e.currentTarget);
      const a = await api<Appeal>('appeals', {
        ...Object.fromEntries(f),
        anonymous: f.get('anonymous') === 'on',
      });
      let uploadError = '';
      if (files.length) {
        try {
          const upload = new FormData();
          files.forEach((f) => upload.append('files', f));
          upload.append('version', String(a.version));
          await api('appeals/' + a.id + '/files', upload);
        } catch (e) {
          uploadError = (e as Error).message;
        }
      }
      refresh();
      close();
      navigate({ view: 'appeals', id: a.id });
      if (uploadError) setError(uploadError);
    } catch (e) {
      setLocalError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="overlay">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="new-title" ref={ref}>
        <div className="p-6 border-b flex justify-between items-start gap-3">
          <div>
            <h2 id="new-title" className="text-xl font-semibold">
              {t('newAppeal')}
            </h2>
            <p className="muted text-xs mt-2 leading-6">{t('createHelp')}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('close')}
            disabled={busy}
            onClick={close}
          >
            <X size={18} />
          </Button>
        </div>
        <form onSubmit={submit} className="new-appeal-form">
          <div className="p-6 space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="create-type">{t('type')}</label>
                <select id="create-type" name="type">
                  {['PROBLEM', 'SUGGESTION', 'PRAISE'].map((v) => (
                    <option value={v} key={v}>
                      {t(`types.${v}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="create-category">{t('category')}</label>
                <select id="create-category" name="categoryId" required>
                  <option value="">—</option>
                  {lookups.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c[locale]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div data-tour="form">
              <label htmlFor="create-title">{t('title')}</label>
              <input id="create-title" name="title" required maxLength={180} />
            </div>
            <div>
              <label htmlFor="create-description">{t('description')}</label>
              <textarea id="create-description" name="description" required maxLength={10000} />
            </div>
            <div>
              <label htmlFor="create-solution">
                {t('proposedSolution')} · {t('optional')}
              </label>
              <textarea id="create-solution" name="proposedSolution" maxLength={10000} />
            </div>
            <div>
              <label htmlFor="create-priority">{t('priority')}</label>
              <select id="create-priority" name="priority" defaultValue="MEDIUM">
                {['LOW', 'MEDIUM', 'HIGH'].map((v) => (
                  <option value={v} key={v}>
                    {t(`priorities.${v}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="create-files">
                {t('attachments')} · {t('optional')}
              </label>
              <input
                id="create-files"
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.txt,.docx,.xlsx"
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
              />
              <p className="text-xs muted mt-2">{t('fileHint')}</p>
            </div>
            {localError && (
              <p className="error" role="alert">
                {t.has(`errors.${localError}`)
                  ? t(`errors.${localError}`)
                  : t('errors.serverError')}
              </p>
            )}
          </div>
          <div className="appeal-form-footer">
            <label className="anonymous-control" data-tour="anonymous">
              <input type="checkbox" name="anonymous" />
              <span>{t('anonymous')}</span>
            </label>
            <div className="flex gap-3">
              <Button type="button" variant="outline" disabled={busy} onClick={close}>
                {t('cancel')}
              </Button>
              <Button disabled={busy} data-tour="submit">
                {busy ? t('loading') : t('submit')}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
export function AppealDetail({ id }: { id: string }) {
  const t = useTranslations();
  const { user, locale, api, refresh, navigate, setError, notice } = useApp();
  const { data: a, loading } = useLoad<Appeal>('appeals/' + id);
  const [busy, setBusy] = useState(false),
    [comment, setComment] = useState(''),
    [editing, setEditing] = useState<string | null>(null),
    [editBody, setEditBody] = useState(''),
    [minutes, setMinutes] = useState('30'),
    [rating, setRating] = useState('5'),
    [completion, setCompletion] = useState('');
  async function mutate(path: string, body: Record<string, unknown>) {
    if (!a) return;
    setBusy(true);
    try {
      await api('appeals/' + a.id + '/' + path, { version: a.version, ...body });
      setEditing(null);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const manageable =
    a &&
    (user.role === 'ADMIN' ||
      a.assigneeId === user.id ||
      (user.role === 'MANAGER' && a.departmentId === user.departmentId));
  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!a) return;
    setBusy(true);
    try {
      await api('appeals/' + a.id + '/comments', { body: comment, version: a.version });
      setComment('');
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function uploadFiles(files: File[]) {
    if (!a || !files.length || busy) return;
    const f = new FormData();
    for (const file of files) f.append('files', file);
    f.append('version', String(a.version));
    setBusy(true);
    try {
      await api('appeals/' + a.id + '/files', f);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading && !a) return <Loading />;
  if (!a) return <Empty />;
  const field = (label: string, value: React.ReactNode) => (
    <div key={label}>
      <dt className="text-[10px] muted mb-1">{label}</dt>
      <dd className="text-xs leading-6">{value}</dd>
    </div>
  );
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mb-5 -ml-3"
        onClick={() => navigate({ view: 'appeals' })}
      >
        <ChevronLeft size={15} />
        {t('appeals')}
      </Button>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span className="text-xs muted">{num(a.number)}</span>
        <Badge value={a.status} />
        <Badge value={a.type} kind="types" />
      </div>
      <h1 className="text-2xl font-semibold leading-relaxed tracking-tight max-w-4xl mb-7">
        {a.title}
      </h1>
      {manageable && <ManageForm appeal={a} />}
      <div className="flex flex-wrap items-center gap-3 my-5">
        <label htmlFor="reminder-interval" className="!mb-0">
          {t('remindAfter')}
        </label>
        <select
          id="reminder-interval"
          className="!w-auto"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
        >
          {[30, 60, 180, 1440, 10080].map((n) => (
            <option key={n} value={n}>
              {t(`intervals.${n}`)}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            try {
              await api('appeals/' + a.id + '/reminder', { minutes: Number(minutes) });
              notice(t('reminderSaved'));
              refresh();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          {t('setReminder')}
        </Button>
      </div>
      <div className="grid xl:grid-cols-[minmax(0,1fr)_310px] gap-6">
        <div className="min-w-0 space-y-6">
          <section className="panel p-6">
            <h2 className="font-semibold mb-4">{t('description')}</h2>
            <p className="text-content text-sm">{a.description}</p>
            {a.proposedSolution && (
              <>
                <h3 className="font-semibold mt-7 mb-3">{t('proposedSolution')}</h3>
                <p className="text-content text-sm">{a.proposedSolution}</p>
              </>
            )}
            <p className="text-[11px] muted mt-6 pt-4 border-t">{t('immutable')}</p>
            {a.recommendedNextStep && (
              <div className="surface rounded-md p-4 mt-5">
                <h3 className="text-xs font-medium mb-2">{t('recommended')}</h3>
                <p className="text-xs text-content muted">{a.recommendedNextStep}</p>
              </div>
            )}
          </section>
          {a.result && (
            <section className="panel p-6 border-l-4 border-l-blue-600">
              <h2 className="font-semibold mb-3">{t('result')}</h2>
              {a.demoResult && <span className="badge mb-3">{t('demoResult')}</span>}
              <p className="text-content text-sm">{a.result}</p>
            </section>
          )}
          <section className="panel p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <Paperclip size={16} />
              {t('attachments')} <span className="muted text-xs">{a.attachments.length}/5</span>
            </h2>
            <div className="space-y-3">
              {a.attachments.map((f) => (
                <a
                  key={f.id}
                  className="flex justify-between gap-4 text-xs text-blue-600 border rounded-md p-3"
                  href={'/api/data/files/' + f.id}
                >
                  {f.name}
                  <span className="muted">{Math.ceil(f.size / 1024)} KB</span>
                </a>
              ))}
            </div>
            {a.attachments.length < 5 && !(user.role === 'ADMIN' && a.authorId !== user.id) && (
              <div className="mt-4">
                <label htmlFor="detail-files">{t('upload')}</label>
                <input
                  id="detail-files"
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.txt,.docx,.xlsx"
                  disabled={busy}
                  onChange={(e) => {
                    void uploadFiles(Array.from(e.target.files || []));
                    e.target.value = '';
                  }}
                />
                <p className="muted text-[10px] mt-2">{t('fileHint')}</p>
              </div>
            )}
          </section>
          <section
            className="panel p-6"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void uploadFiles(Array.from(e.dataTransfer.files));
            }}
            onPaste={(e) => {
              if (e.clipboardData.files.length) {
                e.preventDefault();
                void uploadFiles(Array.from(e.clipboardData.files));
              }
            }}
          >
            <div className="flex justify-between items-center mb-4">
              <p className="text-xs muted">{t('dropFiles')}</p>
              {user.role === 'ADMIN' && a.comments.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(t('confirmDiscussionDelete')))
                      void mutate('discussion-delete', {});
                  }}
                >
                  {t('deleteDiscussion')}
                </Button>
              )}
            </div>
            <h2 className="font-semibold mb-5">
              {t('comments')} <span className="muted text-xs">{a.comments.length}</span>
            </h2>
            {a.comments.map((c) => (
              <div key={c.id} className="mb-5 pb-5 border-b">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <strong>{c.author.name}</strong>
                  <span className="muted text-[10px]">{date(c.createdAt, locale, true)}</span>
                </div>
                {editing === c.id ? (
                  <div className="space-y-2 mt-3">
                    <textarea
                      aria-label={t('editMessage')}
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      maxLength={10000}
                    />
                    <Button
                      disabled={busy || !editBody.trim()}
                      onClick={() =>
                        void mutate('comments/' + c.id, { action: 'edit', body: editBody })
                      }
                    >
                      {t('save')}
                    </Button>
                    <Button variant="ghost" onClick={() => setEditing(null)}>
                      {t('cancel')}
                    </Button>
                  </div>
                ) : (
                  <p className="text-content text-sm mt-3">{c.body}</p>
                )}
                {(c.author.id === user.id || user.role === 'ADMIN') && (
                  <div className="flex gap-2 mt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setEditing(c.id);
                        setEditBody(c.body);
                      }}
                    >
                      {t('editMessage')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(t('confirmMessageDelete')))
                          void mutate('comments/' + c.id, { action: 'delete' });
                      }}
                    >
                      {t('delete')}
                    </Button>
                  </div>
                )}
              </div>
            ))}
            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              {a.attachments.map((f) => (
                <a
                  key={f.id}
                  href={'/api/data/files/' + f.id}
                  className="border rounded p-2 text-xs"
                >
                  {['image/png', 'image/jpeg'].includes(f.mime) && (
                    <img
                      src={'/api/data/files/' + f.id + '?inline=1'}
                      alt={f.name}
                      className="max-h-48 w-full object-contain mb-2"
                      loading="lazy"
                    />
                  )}
                  {f.name}
                </a>
              ))}
            </div>
            <form onSubmit={submitComment}>
              <label htmlFor="comment" className="sr-only">
                {t('comments')}
              </label>
              <textarea
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={10000}
                placeholder={t('commentPlaceholder')}
                required
              />
              <div className="flex justify-end mt-3">
                <Button disabled={busy || !comment.trim()}>
                  {busy ? t('loading') : t('send')}
                </Button>
              </div>
            </form>
          </section>
          {a.authorId === user.id && a.firstResponseAt && !a.rating && (
            <section className="panel p-6">
              <h2 className="font-semibold mb-4">{t('satisfied')}</h2>
              <label htmlFor="completion-rating">{t('rating')}</label>
              <select
                id="completion-rating"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} / 5
                  </option>
                ))}
              </select>
              <label htmlFor="completion-reason" className="mt-3">
                {t('commentPlaceholder')}
              </label>
              <textarea
                id="completion-reason"
                value={completion}
                maxLength={10000}
                onChange={(e) => setCompletion(e.target.value)}
              />
              <Button
                className="mt-3"
                disabled={busy || !completion.trim()}
                onClick={() =>
                  void mutate('complete', { rating: Number(rating), reason: completion })
                }
              >
                {t('closeOwn')}
              </Button>
            </section>
          )}
          {a.rating && (
            <p className="panel p-4">
              {t('rating')}: {a.rating} / 5
            </p>
          )}
          <section className="panel p-6">
            <h2 className="font-semibold mb-5">{t('history')}</h2>
            {a.history.map((h) => (
              <HistoryRow key={h.id} h={h} />
            ))}
          </section>
        </div>
        <aside className="panel p-6 h-fit">
          <h2 className="font-semibold border-b pb-4 mb-5">{num(a.number)}</h2>
          <dl className="space-y-5">
            {field(t('author'), a.author.name)}
            {field(t('department'), departmentName(a.department.name, locale))}
            {field(t('assignee'), a.assignee?.name || t('unassigned'))}
            {field(t('category'), a.category[locale])}
            {field(t('priority'), <Badge value={a.priority} kind="priorities" />)}
            {field(
              t('dueAt'),
              <span
                className={
                  new Date(a.dueAt) < new Date() && !terminal.includes(a.status)
                    ? 'text-red-600'
                    : ''
                }
              >
                {date(a.dueAt, locale, true)}
                {new Date(a.dueAt) < new Date() &&
                  !terminal.includes(a.status) &&
                  ' · ' + t('overdue')}
              </span>,
            )}
            {field(t('createdAt'), date(a.createdAt, locale, true))}
          </dl>
          {a.demo && (
            <p className="surface p-3 rounded-md muted text-[10px] leading-5 mt-6">
              {t('demoNotice')}
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
function ManageForm({ appeal: a }: { appeal: Appeal }) {
  const t = useTranslations();
  const { user, lookups, api, refresh, setError, notice } = useApp();
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editVersion, setEditVersion] = useState(a.version);
  useEffect(() => {
    if (!dirty) setEditVersion(a.version);
  }, [a.version, dirty]);
  const assign =
    user.role === 'ADMIN' || (user.role === 'MANAGER' && user.departmentId === a.departmentId);
  const statuses = terminal.includes(a.status)
    ? user.role === 'ADMIN'
      ? ['REVIEW']
      : []
    : transitions[a.status];
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const b: Record<string, unknown> = { version: editVersion };
    if (f.get('status') !== a.status) b.status = f.get('status');
    if (f.get('priority') !== a.priority) b.priority = f.get('priority');
    if (assign && f.get('assigneeId') !== (a.assigneeId || ''))
      b.assigneeId = f.get('assigneeId') || null;
    const d = new Date(String(f.get('dueAt')));
    if (!Number.isNaN(d.getTime()) && Math.abs(d.getTime() - new Date(a.dueAt).getTime()) >= 60000)
      b.dueAt = d.toISOString();
    if (f.get('reason')) b.reason = f.get('reason');
    try {
      await api('appeals/' + a.id, b);
      setDirty(false);
      refresh();
      notice(t('saved'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const localDate = (s: string) => {
    const d = new Date(s);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  return (
    <section className="panel p-6 mb-6 border-t-4 border-t-primary">
      <h2 className="font-semibold mb-5">{t('manage')}</h2>
      <form
        onSubmit={submit}
        key={editVersion}
        onChange={() => setDirty(true)}
        className="space-y-5"
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="manage-status">{t('status')}</label>
            <select id="manage-status" name="status" defaultValue={a.status}>
              <option value={a.status}>{t(`statuses.${a.status}`)}</option>
              {statuses.map((s) => (
                <option value={s} key={s}>
                  {t(`statuses.${s}`)}
                </option>
              ))}
            </select>
          </div>
          <details className="sm:col-span-2">
            <summary className="cursor-pointer text-sm font-medium mb-3">
              {t('moreOptions')}
            </summary>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="manage-priority">{t('priority')}</label>
                <select id="manage-priority" name="priority" defaultValue={a.priority}>
                  {['LOW', 'MEDIUM', 'HIGH'].map((p) => (
                    <option value={p} key={p}>
                      {t(`priorities.${p}`)}
                    </option>
                  ))}
                </select>
              </div>
              {assign && (
                <div>
                  <label htmlFor="manage-assignee">{t('assignee')}</label>
                  <select id="manage-assignee" name="assigneeId" defaultValue={a.assigneeId || ''}>
                    {a.assignee && !lookups.users.some((u) => u.id === a.assigneeId) && (
                      <option value={a.assignee.id}>{a.assignee.name}</option>
                    )}
                    <option value="">{t('unassigned')}</option>
                    {lookups.users
                      .filter(
                        (u) =>
                          u.role !== 'EMPLOYEE' &&
                          (user.role === 'ADMIN' ||
                            u.departmentId === user.departmentId ||
                            u.id === a.assigneeId),
                      )
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              <div>
                <label htmlFor="manage-due">{t('dueAt')}</label>
                <input
                  id="manage-due"
                  name="dueAt"
                  type="datetime-local"
                  defaultValue={localDate(a.dueAt)}
                  required
                />
              </div>
            </div>
          </details>
        </div>
        <div>
          <label htmlFor="manage-reason">{t('reason')}</label>
          <textarea id="manage-reason" name="reason" maxLength={10000} />
          <p className="muted text-xs mt-2 leading-6">{t('reasonHint')}</p>
        </div>
        <Button disabled={busy}>{busy ? t('loading') : t('save')}</Button>
      </form>
    </section>
  );
}
function HistoryRow({ h }: { h: History }) {
  const t = useTranslations();
  const { locale, lookups } = useApp();
  function val(key: string, v: unknown) {
    if (v === null) return t('unassigned');
    if (key === 'status') return t(`statuses.${v}`);
    if (key === 'priority') return t(`priorities.${v}`);
    if (key === 'dueAt') return date(String(v), locale, true);
    if (key === 'assigneeId') return lookups.users.find((u) => u.id === v)?.name || t('assignee');
    return String(v);
  }
  return (
    <div className="border-l-2 pl-4 pb-6 last:pb-0">
      <p className="text-xs font-medium">{t(`events.${h.action}`)}</p>
      <p className="text-[10px] muted mt-1">
        {h.actor.name} · {date(h.createdAt, locale, true)}
      </p>
      {Object.entries(h.changes)
        .filter(
          ([k, v]) =>
            ['status', 'priority', 'dueAt', 'assigneeId'].includes(k) && v && typeof v === 'object',
        )
        .map(([k, v]) => (
          <p key={k} className="text-xs muted mt-2">
            {t(k)}: {val(k, (v as { from: unknown }).from)} → {val(k, (v as { to: unknown }).to)}
          </p>
        ))}
      {h.reason && <p className="text-content text-xs mt-2">{h.reason}</p>}
    </div>
  );
}
