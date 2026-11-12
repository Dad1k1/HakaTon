// Standalone demo adapter. IndexedDB persists records and attachments on this device.
import dataset from '../data/dataset.json';
import { categories, accounts } from '../scripts/catalog';
import {
  canSee,
  canManage,
  canAssign,
  validTransition,
  metrics,
  terminal,
  dailyActivity,
} from '../src/lib/domain';
type Row = Record<string, any>;
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const fail = (code: string, status = 400): never => {
  throw { code, status };
};
function seed() {
  const departments = [...new Set(accounts.map((a) => a[2]))].map((name) => ({ id: uid(), name }));
  const users = [['admin', 'Администратор', 'Управление', 'ADMIN'], ...accounts].map(
    ([login, name, dep, role]) => ({
      id: uid(),
      login,
      name,
      role,
      departmentId: departments.find((d) => d.name === dep)!.id,
      locale: 'ru',
      theme: 'light',
      blocked: false,
      deletedAt: null,
      mustChangePassword: false,
      guideDismissed: false,
      password: 'demo12345678',
    }),
  );
  const cats = categories.map(([code, ru, kk, en]) => ({
    id: uid(),
    code,
    ru,
    kk,
    en,
    active: true,
  }));
  const statuses: Row = {
    Новое: 'NEW',
    'На рассмотрении': 'REVIEW',
    'В работе': 'IN_PROGRESS',
    'Ожидает уточнения': 'WAITING',
    Реализовано: 'IMPLEMENTED',
    Отклонено: 'REJECTED',
    Закрыто: 'CLOSED',
  };
  const appeals = dataset.map((r, i) => {
    const author = users.find((u) => u.name === r.author) || users[1];
    const assignee = users.find((u) => u.name === r.assignee);
    const createdAt = new Date(Date.now() - (20 - i) * 86400000).toISOString();
    const status = statuses[r.status] || 'NEW';
    return {
      id: uid(),
      number: r.number,
      title: r.description.split('. ')[0].slice(0, 120),
      description: r.description,
      recommendedNextStep: r.recommendedNextStep,
      sourceAuthor: r.author,
      sourceAssignee: r.assignee,
      type:
        ({ Проблема: 'PROBLEM', Предложение: 'SUGGESTION', Благодарность: 'PRAISE' } as Row)[
          r.type
        ] || 'PRAISE',
      status,
      priority: ({ Высокий: 'HIGH', Средний: 'MEDIUM', Низкий: 'LOW' } as Row)[r.priority],
      authorId: author.id,
      departmentId: author.departmentId,
      assigneeId: assignee?.id || null,
      categoryId: (cats.find((c) => c.ru === r.category) || cats[0]).id,
      dueAt: new Date(new Date(createdAt).getTime() + 5 * 86400000).toISOString(),
      createdAt,
      firstResponseAt: status === 'NEW' ? null : createdAt,
      result: terminal.includes(status) ? r.recommendedNextStep : null,
      demo: true,
      demoResult: true,
      anonymous: false,
      version: 1,
      rating: null,
      comments: [],
      attachments: [],
      history: [],
    };
  });
  return {
    users,
    departments,
    categories: cats,
    appeals,
    notifications: [],
    rules: [],
    sla: { HIGH: 2, MEDIUM: 5, LOW: 10 },
    session: null,
  } as Row;
}
export async function installOffline() {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('modus-demo', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('state');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  let state: Row = await new Promise((resolve, reject) => {
    const r = db.transaction('state').objectStore('state').get('data');
    r.onsuccess = () => resolve(r.result || seed());
    r.onerror = () => reject(r.error);
  });
  const save = () =>
    new Promise<void>((resolve, reject) => {
      const tx = db.transaction('state', 'readwrite');
      tx.objectStore('state').put(state, 'data');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  await save();
  const userView = (u: Row) => {
    const { password, ...safe } = u;
    return { ...safe, department: state.departments.find((d: Row) => d.id === u.departmentId) };
  };
  const view = (a: Row) => ({
    ...a,
    author: a.anonymous
      ? { id: a.authorId, name: 'Анонимный сотрудник' }
      : userView(state.users.find((u: Row) => u.id === a.authorId)),
    assignee: a.assigneeId ? userView(state.users.find((u: Row) => u.id === a.assigneeId)) : null,
    category: state.categories.find((c: Row) => c.id === a.categoryId),
    department: state.departments.find((d: Row) => d.id === a.departmentId),
  });
  function filtered(u: any, q: URLSearchParams) {
    return state.appeals
      .filter((a: any) => {
        if (!canSee(u, a)) return false;
        const search = (q.get('q') || '').toLowerCase();
        if (
          search &&
          !`${a.title} ${a.description} A-${String(a.number).padStart(3, '0')}`
            .toLowerCase()
            .includes(search)
        )
          return false;
        for (const k of [
          'status',
          'priority',
          'type',
          'categoryId',
          'departmentId',
          'assigneeId',
        ]) {
          const v = q.get(k);
          if (v && (v === 'unassigned' ? a[k] !== null : a[k] !== v)) return false;
        }
        if (q.get('completed') === 'true' && !terminal.includes(a.status)) return false;
        if (
          q.get('overdue') === 'true' &&
          (terminal.includes(a.status) || new Date(a.dueAt).getTime() >= Date.now())
        )
          return false;
        if (
          q.get('awaitingResponse') === 'true' &&
          (a.firstResponseAt || terminal.includes(a.status))
        )
          return false;
        if (q.get('dueFrom') && a.dueAt < q.get('dueFrom')!) return false;
        if (q.get('dueTo') && a.dueAt > q.get('dueTo')! + 'T23:59:59.999Z') return false;
        return true;
      })
      .sort((a: Row, b: Row) => {
        const k = q.get('sort') || 'createdAt';
        return (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (q.get('order') === 'asc' ? 1 : -1);
      });
  }
  async function handle(url: URL, options: RequestInit): Promise<any> {
    const path = url.pathname.replace('/api/data/', '').split('/');
    const raw = options.body;
    const b: any =
      raw instanceof FormData
        ? raw
        : raw && !url.pathname.startsWith('/api/auth/')
          ? JSON.parse(String(raw))
          : undefined;
    const post = options.method === 'POST';
    if (url.pathname.startsWith('/api/auth/')) {
      if (url.pathname.endsWith('csrf')) return { csrfToken: 'offline-demo' };
      if (url.pathname.endsWith('signout')) {
        state.session = null;
        return { url: '/' };
      }
      const f = new URLSearchParams(String(raw));
      const u = state.users.find(
        (u: Row) =>
          u.login === f.get('login') &&
          u.password === f.get('password') &&
          !u.blocked &&
          !u.deletedAt,
      );
      if (!u) return { url: '/?error=CredentialsSignin' };
      state.session = u.id;
      return { url: '/' };
    }
    const u = state.users.find((u: Row) => u.id === state.session && !u.blocked && !u.deletedAt);
    if (!u) fail('unauthorized', 401);
    if (path[0] === 'me') return userView(u);
    if (path[0] === 'lookups')
      return {
        categories: state.categories.filter((c: Row) => c.active),
        departments: state.departments,
        users: state.users.filter((v: Row) => !v.blocked && !v.deletedAt).map(userView),
      };
    if (path[0] === 'profile') {
      Object.assign(u, b);
      return userView(u);
    }
    if (path[0] === 'password') {
      if (b.currentPassword !== u.password) fail('wrongPassword');
      if (b.newPassword.length < 12) fail('invalidInput');
      u.password = b.newPassword;
      u.mustChangePassword = false;
      state.session = null;
      return { ok: true, signInAgain: true };
    }
    if (path[0] === 'notifications') {
      const rows = state.notifications.filter(
        (n: Row) =>
          n.userId === u.id &&
          n.deliverAt <= now() &&
          state.appeals.some((a: any) => a.id === n.appealId && canSee(u, a)),
      );
      if (post) {
        rows.filter((n: Row) => !b.id || n.id === b.id).forEach((n: Row) => (n.readAt = now()));
        return { ok: true };
      }
      return rows.map((n: Row) => ({
        ...n,
        appeal: view(state.appeals.find((a: Row) => a.id === n.appealId)),
      }));
    }
    if (path[0] === 'analytics') {
      const rows = filtered(u, url.searchParams);
      return {
        daily: dailyActivity(
          rows.map((a: Row) => ({
            createdAt: new Date(a.createdAt),
            completedAt: a.completedAt ? new Date(a.completedAt) : null,
          })),
        ),
        ...metrics(
          rows.map((a: Row) => ({
            ...a,
            dueAt: new Date(a.dueAt),
            createdAt: new Date(a.createdAt),
            firstResponseAt: a.firstResponseAt ? new Date(a.firstResponseAt) : null,
          })),
        ),
        waiting: rows.filter((a: Row) => a.status === 'WAITING').length,
        awaitingResponse: rows.filter(
          (a: Row) => !a.firstResponseAt && !terminal.includes(a.status),
        ).length,
        unassigned: rows.filter((a: Row) => !a.assigneeId).length,
        themes: [],
        recent: rows
          .flatMap((a: Row) => a.history.map((h: Row) => ({ ...h, appeal: view(a) })))
          .sort((a: Row, b: Row) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 8),
      };
    }
    if (path[0] === 'admin') {
      if (u.role !== 'ADMIN') fail('forbidden', 403);
      const k = path[1];
      if (!post) {
        if (k === 'users') return state.users.map(userView);
        if (k === 'config')
          return {
            ...state,
            rules: state.rules.map((r: Row) => ({
              ...r,
              category: state.categories.find((c: Row) => c.id === r.categoryId),
              department: state.departments.find((d: Row) => d.id === r.departmentId),
              assignee: state.users.find((v: Row) => v.id === r.assigneeId),
            })),
          };
      }
      if (k === 'sla') {
        state.sla = b;
        return { ok: true };
      }
      if (k === 'rule-delete') {
        state.rules = state.rules.filter((r: Row) => r.id !== b.id);
        return { ok: true };
      }
      const collection = state[k];
      if (!Array.isArray(collection)) fail('notFound', 404);
      const existing = collection.find((r: Row) => r.id === (path[2] || b.id));
      if (existing) {
        if (existing.id === u.id && (b.deleted || b.blocked || (b.role && b.role !== 'ADMIN')))
          fail('forbidden', 403);
        Object.assign(existing, b);
        if ('deleted' in b) existing.deletedAt = b.deleted ? now() : null;
      } else {
        if (k === 'users' && collection.some((r: Row) => r.login === b.login))
          fail('conflict', 409);
        collection.push({
          id: uid(),
          active: true,
          blocked: false,
          deletedAt: null,
          mustChangePassword: false,
          locale: 'ru',
          theme: 'light',
          ...b,
        });
      }
      return { ok: true };
    }
    if (path[0] === 'appeals') {
      if (!path[1]) {
        if (!post) {
          const rows = filtered(u, url.searchParams);
          const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
          return {
            items: rows.slice((page - 1) * 10, page * 10).map(view),
            total: rows.length,
            page,
            pageSize: 10,
          };
        }
        if (!b.title?.trim() || !b.description?.trim()) fail('invalidInput');
        const candidate =
          state.rules.find(
            (r: Row) => r.categoryId === b.categoryId && r.departmentId === u.departmentId,
          ) || state.rules.find((r: Row) => r.categoryId === b.categoryId && !r.departmentId);
        const assignee =
          state.users.find(
            (v: Row) => v.id === candidate?.assigneeId && !v.blocked && !v.deletedAt,
          ) ||
          state.users.find(
            (v: Row) =>
              v.role === 'MANAGER' &&
              v.departmentId === u.departmentId &&
              !v.blocked &&
              !v.deletedAt,
          );
        const a = {
          ...b,
          id: uid(),
          number: Math.max(20, ...state.appeals.map((a: Row) => a.number)) + 1,
          authorId: u.id,
          departmentId: u.departmentId,
          assigneeId: assignee?.id || null,
          status: 'NEW',
          createdAt: now(),
          dueAt: new Date(Date.now() + (state.sla[b.priority] || 5) * 86400000).toISOString(),
          version: 1,
          firstResponseAt: null,
          result: null,
          rating: null,
          demo: false,
          demoResult: false,
          comments: [],
          attachments: [],
          history: [],
        };
        state.appeals.push(a);
        return view(a);
      }
      const a = state.appeals.find((a: Row) => a.id === path[1]);
      if (!a || !canSee(u, a)) fail('notFound', 404);
      if (!post) return view(a);
      if (path[2] === 'reminder') {
        state.notifications.push({
          id: uid(),
          userId: u.id,
          appealId: a.id,
          kind: 'reminder',
          createdAt: now(),
          deliverAt: new Date(Date.now() + b.minutes * 60000).toISOString(),
          readAt: null,
        });
        return { ok: true };
      }
      const version = b instanceof FormData ? Number(b.get('version')) : b.version;
      if (a.version !== version) fail('conflict', 409);
      let action = 'updated';
      if (path[2] === 'files') {
        const files = b.getAll('files') as File[];
        if (a.attachments.length + files.length > 10) fail('tooManyFiles');
        for (const f of files) {
          if (f.size > 10 * 1024 * 1024) fail('fileTooLarge', 413);
          const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(f);
          });
          a.attachments.push({ id: uid(), name: f.name, size: f.size, mime: f.type, data });
        }
        action = 'filesAdded';
      } else if (path[2] === 'comments' && path[3]) {
        const c = a.comments.find((c: Row) => c.id === path[3]);
        if (!c) fail('notFound', 404);
        if (u.role !== 'ADMIN' && c.author.id !== u.id) fail('forbidden', 403);
        if (b.action === 'edit') c.body = b.body;
        else a.comments = a.comments.filter((c: Row) => c.id !== path[3]);
        action = 'commented';
      } else if (path[2] === 'discussion-delete') {
        if (u.role !== 'ADMIN') fail('forbidden', 403);
        a.comments = [];
        action = 'commented';
      } else if (path[2] === 'comments') {
        if (!b.body?.trim()) fail('invalidInput');
        a.comments.push({
          id: uid(),
          body: b.body,
          createdAt: now(),
          author: { id: u.id, name: u.name },
        });
        if (canManage(u, a) && u.id !== a.authorId && !a.firstResponseAt) a.firstResponseAt = now();
        action = 'commented';
      } else if (path[2] === 'complete') {
        if (a.authorId !== u.id) fail('forbidden', 403);
        if (!a.firstResponseAt || a.rating || !b.reason?.trim() || b.rating < 1 || b.rating > 5)
          fail('invalidTransition');
        a.completedAt = now();
        a.rating = b.rating;
        a.result ||= b.reason;
        if (!terminal.includes(a.status)) a.status = 'CLOSED';
        action = 'completedByAuthor';
      } else {
        if (!canManage(u, a)) fail('forbidden', 403);
        if (b.status && !validTransition(a.status, b.status, u.role, b.reason))
          fail('invalidTransition');
        if ('assigneeId' in b && !canAssign(u, a)) fail('forbidden', 403);
        for (const k of ['status', 'priority', 'assigneeId', 'dueAt']) if (k in b) a[k] = b[k];
        if (b.status && terminal.includes(b.status)) {
          a.completedAt = now();
          a.result = b.reason;
          a.demoResult = false;
        }
      }
      a.version++;
      a.history.unshift({
        id: uid(),
        action,
        reason: b.reason || '',
        changes: raw instanceof FormData ? {} : b,
        actor: { name: u.name },
        createdAt: now(),
      });
      for (const v of state.users.filter((v: Row) => v.id !== u.id && canSee(v as any, a)))
        state.notifications.push({
          id: uid(),
          userId: v.id,
          appealId: a.id,
          kind: action === 'commented' ? 'commented' : 'updated',
          readAt: null,
          createdAt: now(),
          deliverAt: now(),
        });
      return view(a);
    }
    fail('notFound', 404);
  }
  const original = window.fetch.bind(window);
  let queue = Promise.resolve();
  window.fetch = ((input: any, options: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
    if (!url.pathname.startsWith('/api/')) return original(input, options);
    const task = queue.then(async () => {
      const before = structuredClone(state);
      try {
        const result = await handle(url, options);
        await save();
        return Response.json(result);
      } catch (e: any) {
        state = before;
        return Response.json({ error: e.code || 'serverError' }, { status: e.status || 500 });
      }
    });
    queue = task.then(() => {});
    return task;
  }) as typeof fetch;
  // Original file links become local data URLs; no network request or server is involved.
  const rewrite = () =>
    document
      .querySelectorAll<
        HTMLAnchorElement | HTMLImageElement
      >('a[href^="/api/data/files/"],img[src^="/api/data/files/"]')
      .forEach((el) => {
        const attr = el.tagName === 'IMG' ? 'src' : 'href';
        const id = el.getAttribute(attr)!.split('/').pop()!.split('?')[0];
        const a = state.appeals.find((a: Row) => a.attachments.some((f: Row) => f.id === id));
        const u = state.users.find((u: Row) => u.id === state.session);
        if (!a || !u || !canSee(u, a)) return;
        const f = a.attachments.find((f: Row) => f.id === id);
        el.setAttribute(attr, f.data);
        if (el instanceof HTMLAnchorElement) el.download = f.name;
      });
  new MutationObserver(rewrite).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  const banner = document.createElement('div');
  banner.style.cssText =
    'padding:8px 12px;background:#fff0d7;color:#5d3700;font:12px sans-serif;text-align:center';
  banner.textContent =
    'Автономное демо · Логин: admin · Пароль: demo12345678 · Данные только на этом устройстве';
  document.body.prepend(banner);
}
