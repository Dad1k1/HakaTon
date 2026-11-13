import { getServerSession } from 'next-auth';
import { Prisma, Appeal, User, Status } from '@prisma/client';
import { z } from 'zod';
import { hash, verify, argon2id } from 'argon2';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { isIPv4 } from 'node:net';
import { db } from './db';
import { createTelegramLink, telegramCall, TelegramError } from './telegram';
import { getTelegramWorkerStatus } from './telegram-status';
import { authOptions } from './auth';
import {
  visibility,
  canSee,
  canManage,
  canAssign,
  terminal,
  validTransition,
  metrics,
  dailyActivity,
  routeCandidate,
} from './domain';
class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Allow same-origin app access from localhost and RFC1918 IPv4 hosts on a LAN. */
export function isAllowedLocalRequest(req: Request, requireOrigin = false) {
  try {
    const rawHost = req.headers.get('host');
    if (!rawHost) return false;
    const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0].trim();
    const requestProtocol = new URL(req.url).protocol;
    const protocol =
      forwardedProto === 'http' || forwardedProto === 'https'
        ? forwardedProto
        : requestProtocol.slice(0, -1);
    if (protocol !== 'http' && protocol !== 'https') return false;
    const url = new URL(protocol + '://' + rawHost);
    if (url.host !== rawHost.toLowerCase()) return false;
    const host = url.hostname.toLowerCase();
    const localName = host === 'localhost' || host.endsWith('.localhost');
    const privateIp =
      isIPv4(host) &&
      (() => {
        const octets = host.split('.').map(Number);
        return (
          octets[0] === 10 ||
          octets[0] === 127 ||
          (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
          (octets[0] === 192 && octets[1] === 168)
        );
      })();
    if (!localName && !privateIp) return false;

    const origin = req.headers.get('origin');
    if (!origin) return !requireOrigin;
    return new URL(origin).origin === url.origin;
  } catch {
    return false;
  }
}
function fail(status: number, code: string): never {
  throw new ApiError(status, code);
}
const str = z.string().trim().min(1).max(10000);
const id = z.string().min(1).max(100);
const priority = z.enum(['LOW', 'MEDIUM', 'HIGH']);
const status = z.enum([
  'NEW',
  'REVIEW',
  'IN_PROGRESS',
  'WAITING',
  'IMPLEMENTED',
  'REJECTED',
  'CLOSED',
]);
const include = {
  author: { select: { id: true, name: true, avatar: true } },
  assignee: { select: { id: true, name: true } },
  category: true,
  department: true,
} satisfies Prisma.AppealInclude;
const safeUser = {
  id: true,
  avatar: true,
  login: true,
  name: true,
  role: true,
  departmentId: true,
  deletedAt: true,
  blocked: true,
  mustChangePassword: true,
  locale: true,
  theme: true,
} satisfies Prisma.UserSelect;
export async function currentUser() {
  const session = await getServerSession(authOptions);
  const s = session?.user as unknown as { id?: string; sessionVersion?: number } | undefined;
  if (!s?.id) fail(401, 'unauthorized');
  const u = await db.user.findUnique({ where: { id: s.id }, include: { department: true } });
  if (!u || u.deletedAt || u.blocked || u.sessionVersion !== s.sessionVersion)
    fail(401, 'unauthorized');
  return u;
}
export function filterWhere(u: User, q: URLSearchParams): Prisma.AppealWhereInput {
  const clauses: Prisma.AppealWhereInput[] = [visibility(u)];
  const search = (q.get('q') || '').slice(0, 200);
  if (search) {
    const n = Number(search.replace(/^A-/i, ''));
    clauses.push({
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        ...(Number.isSafeInteger(n) ? [{ number: n }] : []),
      ],
    });
  }
  for (const k of ['status', 'priority', 'type'] as const) {
    const v = q.get(k);
    const values =
      k === 'status'
        ? status.options
        : k === 'priority'
          ? priority.options
          : ['PROBLEM', 'SUGGESTION', 'PRAISE'];
    if (v && values.includes(v as never)) clauses.push({ [k]: v });
  }
  for (const k of ['categoryId', 'departmentId', 'assigneeId'] as const) {
    const v = q.get(k);
    if (v) clauses.push({ [k]: v === 'unassigned' ? null : v });
  }
  if (q.get('awaitingResponse') === 'true')
    clauses.push({ firstResponseAt: null, status: { notIn: terminal } });
  if (q.get('overdue') === 'true')
    clauses.push({ dueAt: { lt: new Date() }, status: { notIn: terminal } });
  for (const [param, operator] of [
    ['dueFrom', 'gte'],
    ['dueTo', 'lte'],
  ] as const) {
    const v = q.get(param);
    if (v) {
      const d = new Date(
        operator === 'lte' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T23:59:59.999Z' : v,
      );
      if (!Number.isNaN(d.getTime())) clauses.push({ dueAt: { [operator]: d } });
    }
  }
  if (q.get('completed') === 'true') clauses.push({ status: { in: terminal } });
  return { AND: clauses };
}
async function accessible(u: User, appealId: string) {
  const a = await db.appeal.findUnique({ where: { id: appealId } });
  if (!a || !canSee(u, a)) fail(404, 'notFound');
  return a;
}
async function notify(tx: Prisma.TransactionClient, a: Appeal, actorId: string, kind: string) {
  const managers = await tx.user.findMany({
    where: {
      blocked: false,
      deletedAt: null,
      OR: [
        { role: 'ADMIN' },
        ...(a.assigneeId ? [] : [{ role: 'MANAGER' as const, departmentId: a.departmentId }]),
      ],
    },
    select: { id: true },
  });
  const participants = await tx.comment.findMany({
    where: { appealId: a.id },
    select: { authorId: true },
    distinct: ['authorId'],
  });
  const ids = new Set([
    a.authorId,
    ...participants.map((p) => p.authorId),
    ...(a.assigneeId ? [a.assigneeId] : managers.map((m) => m.id)),
  ]);
  if (kind === 'created') managers.forEach((m) => ids.add(m.id));
  ids.delete(actorId);
  await tx.notification.createMany({
    data: [...ids].map((userId) => ({ userId, appealId: a.id, kind })),
  });
}
async function versioned(
  tx: Prisma.TransactionClient,
  a: Appeal,
  version: number,
  data: Prisma.AppealUncheckedUpdateManyInput,
) {
  const changed = await tx.appeal.updateMany({
    where: { id: a.id, version },
    data: { ...data, version: { increment: 1 } },
  });
  if (!changed.count) fail(409, 'conflict');
}
function publicUser(u: User) {
  const { passwordHash: _, sessionVersion: __, ...safe } = u;
  return safe;
}
async function get(u: User, p: string[], q: URLSearchParams) {
  if (p[0] === 'me') return publicUser(u);
  if (p[0] === 'telegram') {
    const connection = await db.telegramConnection.findUnique({ where: { userId: u.id } });
    return {
      enabled: !!process.env.TELEGRAM_BOT_TOKEN,
      connected: !!connection?.chatId,
      worker: await getTelegramWorkerStatus(),
    };
  }
  if (p[0] === 'lookups')
    return {
      categories: await db.category.findMany({ where: { active: true }, orderBy: { code: 'asc' } }),
      departments: await db.department.findMany({ orderBy: { name: 'asc' } }),
      users: await db.user.findMany({
        where: {
          blocked: false,
          deletedAt: null,
          ...(u.role === 'ADMIN'
            ? {}
            : u.role === 'MANAGER'
              ? { OR: [{ departmentId: u.departmentId }, { assigned: { some: visibility(u) } }] }
              : { OR: [{ id: u.id }, { assigned: { some: visibility(u) } }] }),
        },
        select: { id: true, name: true, role: true, departmentId: true },
      }),
    };
  if (p[0] === 'appeals' && !p[1]) {
    const page = Math.floor(Math.max(1, Math.min(100000, Number(q.get('page')) || 1))),
      pageSize = 10;
    const sort = ['createdAt', 'dueAt', 'number', 'priority', 'status', 'title'].includes(
      q.get('sort') || '',
    )
      ? q.get('sort')!
      : 'createdAt';
    const where = filterWhere(u, q);
    const [items, total] = await db.$transaction([
      db.appeal.findMany({
        where,
        include,
        orderBy: [{ [sort]: q.get('order') === 'asc' ? 'asc' : 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.appeal.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
  if (p[0] === 'appeals' && p[1]) {
    await accessible(u, p[1]);
    return db.appeal.findUnique({
      where: { id: p[1] },
      include: {
        ...include,
        attachments: { select: { id: true, name: true, size: true, mime: true } },
        comments: {
          include: { author: { select: { id: true, name: true, avatar: true } } },
          orderBy: { createdAt: 'asc' },
        },
        history: { include: { actor: { select: { name: true } } }, orderBy: { createdAt: 'desc' } },
      },
    });
  }
  if (p[0] === 'analytics') {
    const where = filterWhere(u, q);
    const rows = await db.appeal.findMany({ where });
    const words = new Map<string, number>();
    const stop = new Set([
      'для',
      'при',
      'как',
      'это',
      'или',
      'что',
      'без',
      'the',
      'and',
      'with',
      'предлагаю',
      'хотелось',
      'иногда',
      'чтобы',
      'можно',
      'было',
      'полезно',
    ]);
    for (const a of rows) {
      for (const w of new Set(a.title.toLowerCase().match(/[\p{L}]{4,}/gu) || [])) {
        if (!stop.has(w)) words.set(w, (words.get(w) || 0) + 1);
      }
    }
    return {
      ...metrics(rows),
      daily: dailyActivity(rows),
      unassigned: u.role === 'ADMIN' ? rows.filter((a) => !a.assigneeId).length : 0,
      waiting: rows.filter((a) => a.status === 'WAITING').length,
      awaitingResponse: rows.filter((a) => !a.firstResponseAt && !terminal.includes(a.status))
        .length,
      themes: [...words]
        .filter(([, v]) => v > 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
      recent: await db.history.findMany({
        where: { appeal: where },
        include: {
          actor: { select: { name: true } },
          appeal: { select: { id: true, number: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    };
  }
  if (p[0] === 'notifications')
    return db.notification.findMany({
      where: { userId: u.id, deliverAt: { lte: new Date() }, appeal: visibility(u) },
      include: { appeal: { select: { id: true, number: true, title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  if (p[0] === 'files' && p[1]) {
    const f = await db.attachment.findUnique({ where: { id: p[1] } });
    if (!f) fail(404, 'notFound');
    await accessible(u, f.appealId);
    const data = await readFile(
      /*turbopackIgnore: true*/ path.join(
        /*turbopackIgnore: true*/ process.env.UPLOAD_DIR || '.local/uploads',
        f.storageKey,
      ),
    );
    return new Response(data, {
      headers: {
        'Content-Type': f.mime,
        'Content-Length': String(f.size),
        'Content-Disposition': `${q.get('inline') === '1' && ['image/png', 'image/jpeg'].includes(f.mime) ? 'inline' : 'attachment'}; filename="download"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  }
  if (p[0] === 'admin') {
    if (u.role !== 'ADMIN') fail(403, 'forbidden');
    if (p[1] === 'users')
      return db.user.findMany({
        select: { ...safeUser, department: true },
        orderBy: { login: 'asc' },
      });
    if (p[1] === 'config')
      return {
        departments: await db.department.findMany(),
        categories: await db.category.findMany(),
        rules: await db.routingRule.findMany({
          include: {
            category: true,
            department: true,
            assignee: { select: { id: true, name: true, blocked: true } },
          },
        }),
        sla: (await db.setting.findUnique({ where: { key: 'sla' } }))?.value ?? {
          HIGH: 2,
          MEDIUM: 5,
          LOW: 10,
        },
      };
  }
  fail(404, 'notFound');
}
async function post(u: User, p: string[], body: unknown) {
  if (p[0] === 'telegram') {
    const b = z
      .object({ action: z.enum(['connect', 'disconnect', 'test']) })
      .strict()
      .parse(body);
    if (b.action === 'disconnect') {
      await db.telegramConnection.deleteMany({ where: { userId: u.id } });
      return { ok: true };
    }
    if (!(await getTelegramWorkerStatus()).ready) fail(503, 'telegramWorkerUnavailable');
    if (b.action === 'test') {
      const connection = await db.telegramConnection.findUnique({ where: { userId: u.id } });
      if (!connection?.chatId) fail(400, 'telegramNotConnected');
      try {
        await telegramCall('sendMessage', {
          chat_id: connection.chatId,
          text:
            (
              {
                ru: 'Проверка связи: уведомления «Модус Трейд» работают.',
                en: 'Connection test: Modus Trade notifications are working.',
                kk: 'Байланысты тексеру: «Модус Трейд» хабарландырулары жұмыс істейді.',
              } as Record<string, string>
            )[u.locale] || 'Modus Trade: connection test.',
        });
      } catch (e) {
        if (e instanceof TelegramError && e.code === 403)
          await db.telegramConnection.deleteMany({
            where: { userId: u.id, chatId: connection.chatId },
          });
        fail(503, 'telegramUnavailable');
      }
      return { ok: true };
    }
    try {
      return await createTelegramLink(u.id);
    } catch {
      fail(503, 'telegramUnavailable');
    }
  }
  if (p[0] === 'profile') {
    const b = z
      .object({
        avatar: z.string().max(80000).nullable().optional(),
        name: str.max(120).optional(),
        locale: z.enum(['ru', 'kk', 'en']).optional(),
        theme: z.enum(['light', 'dark']).optional(),
        guideDismissed: z.boolean().optional(),
      })
      .strict()
      .parse(body);
    if (b.avatar) {
      const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(b.avatar);
      if (!match) fail(400, 'fileType');
      const bytes = Buffer.from(match[2], 'base64');
      if (!bytes.length || bytes.length > 60000) fail(400, 'fileSize');
      let detected;
      try {
        detected = await fileTypeFromBuffer(bytes);
      } catch {
        fail(400, 'fileType');
      }
      if (detected?.mime !== 'image/' + match[1]) fail(400, 'fileType');
    }
    return publicUser(await db.user.update({ where: { id: u.id }, data: b }));
  }
  if (p[0] === 'password') {
    const b = z
      .object({ currentPassword: str.max(256), newPassword: z.string().min(12).max(256) })
      .parse(body);
    if (!(await verify(u.passwordHash, b.currentPassword))) fail(400, 'wrongPassword');
    await db.user.update({
      where: { id: u.id },
      data: {
        passwordHash: await hash(b.newPassword, { type: argon2id }),
        mustChangePassword: false,
        sessionVersion: { increment: 1 },
      },
    });
    return { ok: true, signInAgain: true };
  }
  if (p[0] === 'notifications') {
    const b = z.object({ id: id.optional() }).parse(body);
    await db.notification.updateMany({
      where: { userId: u.id, deliverAt: { lte: new Date() }, ...(b.id ? { id: b.id } : {}) },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
  if (p[0] === 'appeals' && !p[1]) {
    const b = z
      .object({
        title: str.max(180),
        description: str,
        proposedSolution: z.string().max(10000).optional(),
        type: z.enum(['PROBLEM', 'SUGGESTION', 'PRAISE']),
        categoryId: id,
        priority,
        anonymous: z.boolean().default(false),
      })
      .strict()
      .parse(body);
    const category = await db.category.findUnique({ where: { id: b.categoryId } });
    if (!category?.active) fail(400, 'validation');
    return db.$transaction(async (tx) => {
      const rules = await tx.routingRule.findMany({
        where: {
          categoryId: b.categoryId,
          OR: [{ departmentId: u.departmentId }, { departmentId: null }],
        },
        include: { assignee: true },
      });
      const manager = await tx.user.findFirst({
        where: { departmentId: u.departmentId, role: 'MANAGER', blocked: false },
        orderBy: { id: 'asc' },
      });
      const exact = rules.find((r) => r.departmentId === u.departmentId),
        general = rules.find((r) => !r.departmentId);
      const assigneeId = routeCandidate(
        exact
          ? {
              assigneeId: exact.assigneeId,
              blocked:
                exact.assignee.blocked ||
                exact.assignee.role === 'EMPLOYEE' ||
                !!exact.assignee.deletedAt,
            }
          : undefined,
        general
          ? {
              assigneeId: general.assigneeId,
              blocked:
                general.assignee.blocked ||
                general.assignee.role === 'EMPLOYEE' ||
                !!general.assignee.deletedAt,
            }
          : undefined,
        manager ?? undefined,
      );
      const sla = (await tx.setting.findUnique({ where: { key: 'sla' } }))?.value as
        | Record<string, number>
        | undefined;
      const a = await tx.appeal.create({
        data: {
          ...b,
          authorId: u.id,
          departmentId: u.departmentId,
          assigneeId,
          dueAt: new Date(
            Date.now() +
              (sla?.[b.priority] ?? { HIGH: 2, MEDIUM: 5, LOW: 10 }[b.priority]) * 86400000,
          ),
        },
      });
      await tx.history.create({
        data: { appealId: a.id, actorId: u.id, action: 'created', changes: { assigneeId } },
      });
      await notify(tx, a, u.id, 'created');
      return a;
    });
  }
  if (p[0] === 'appeals' && p[1]) {
    const a = await accessible(u, p[1]);
    if (p[2] === 'reminder') {
      const b = z
        .object({
          minutes: z
            .number()
            .int()
            .refine((n) => [30, 60, 180, 1440, 10080].includes(n)),
        })
        .strict()
        .parse(body);
      return db.notification.create({
        data: {
          userId: u.id,
          appealId: a.id,
          kind: 'reminder',
          deliverAt: new Date(Date.now() + b.minutes * 60000),
        },
      });
    }
    if (p[2] === 'complete') {
      if (u.id !== a.authorId) fail(403, 'forbidden');
      const b = z
        .object({
          version: z.number().int().positive(),
          rating: z.number().int().min(1).max(5),
          reason: str,
        })
        .strict()
        .parse(body);
      if (a.rating || !a.firstResponseAt) fail(400, 'invalidTransition');
      return db.$transaction(async (tx) => {
        await versioned(tx, a, b.version, {
          status: terminal.includes(a.status) ? a.status : 'CLOSED',
          completedAt: new Date(),
          rating: b.rating,
          result: a.result || b.reason,
          demoResult: false,
        });
        await tx.history.create({
          data: {
            appealId: a.id,
            actorId: u.id,
            action: 'completedByAuthor',
            changes: { rating: b.rating },
            reason: b.reason,
          },
        });
        await notify(tx, a, u.id, 'result');
        return { ok: true };
      });
    }
    if (p[2] === 'discussion-delete' || (p[2] === 'comments' && p[3])) {
      const b = z
        .object({
          version: z.number().int().positive(),
          action: z.enum(['edit', 'delete']).default('delete'),
          body: str.optional(),
        })
        .strict()
        .parse(body);
      if (p[2] === 'discussion-delete' && u.role !== 'ADMIN') fail(403, 'forbidden');
      if (p[3]) {
        const c = await db.comment.findFirst({ where: { id: p[3], appealId: a.id } });
        if (!c) fail(404, 'notFound');
        if (c.authorId !== u.id && u.role !== 'ADMIN') fail(403, 'forbidden');
        if (b.action === 'edit' && !b.body) fail(400, 'validation');
      }
      return db.$transaction(async (tx) => {
        await versioned(tx, a, b.version, {});
        if (!p[3]) await tx.comment.deleteMany({ where: { appealId: a.id } });
        else if (b.action === 'edit')
          await tx.comment.update({ where: { id: p[3] }, data: { body: b.body! } });
        else await tx.comment.delete({ where: { id: p[3] } });
        await tx.history.create({
          data: {
            appealId: a.id,
            actorId: u.id,
            action: !p[3]
              ? 'discussionDeleted'
              : b.action === 'edit'
                ? 'commentEdited'
                : 'commentDeleted',
            changes: { commentId: p[3] || null },
          },
        });
        await notify(tx, a, u.id, 'commented');
        return { ok: true };
      });
    }
    if (p[2] === 'comments') {
      const b = z.object({ body: str, version: z.number().int().positive() }).parse(body);
      return db.$transaction(async (tx) => {
        await versioned(tx, a, b.version, {
          ...(canManage(u, a) && u.id !== a.authorId && !a.firstResponseAt
            ? { firstResponseAt: new Date() }
            : {}),
        });
        const comment = await tx.comment.create({
          data: { appealId: a.id, authorId: u.id, body: b.body },
        });
        await tx.history.create({
          data: {
            appealId: a.id,
            actorId: u.id,
            action: 'commented',
            changes: { commentId: comment.id },
          },
        });
        await notify(tx, a, u.id, 'commented');
        return comment;
      });
    }
    if (!canManage(u, a)) fail(403, 'forbidden');
    const b = z
      .object({
        version: z.number().int().positive(),
        status: status.optional(),
        priority: priority.optional(),
        assigneeId: id.nullable().optional(),
        dueAt: z.string().datetime().optional(),
        reason: z.string().trim().max(10000).optional(),
      })
      .strict()
      .parse(body);
    if (b.version !== a.version) fail(409, 'conflict');
    const data: Prisma.AppealUncheckedUpdateManyInput = {};
    const changes: Record<string, unknown> = {};
    if (b.status && b.status !== a.status) {
      if (!validTransition(a.status, b.status, u.role, b.reason)) fail(400, 'invalidTransition');
      data.status = b.status;
      data.completedAt = terminal.includes(b.status) ? new Date() : null;
      if (terminal.includes(b.status)) {
        data.result = b.reason!;
        data.demoResult = false;
      } else if (terminal.includes(a.status)) {
        data.result = null;
        data.demoResult = false;
      }
      changes.status = { from: a.status, to: b.status };
    }
    if (b.priority && b.priority !== a.priority) {
      data.priority = b.priority;
      changes.priority = { from: a.priority, to: b.priority };
    }
    if (b.dueAt && new Date(b.dueAt).getTime() !== a.dueAt.getTime()) {
      if (!b.reason) fail(400, 'reasonRequired');
      data.dueAt = new Date(b.dueAt);
      changes.dueAt = { from: a.dueAt.toISOString(), to: b.dueAt };
    }
    if (b.assigneeId !== undefined && b.assigneeId !== a.assigneeId) {
      if (!canAssign(u, a)) fail(403, 'forbidden');
      if (b.assigneeId) {
        const candidate = await db.user.findUnique({ where: { id: b.assigneeId } });
        if (
          !candidate ||
          candidate.blocked ||
          candidate.role === 'EMPLOYEE' ||
          (u.role === 'MANAGER' && candidate.departmentId !== u.departmentId)
        )
          fail(400, 'validation');
      }
      data.assigneeId = b.assigneeId;
      changes.assigneeId = { from: a.assigneeId, to: b.assigneeId };
    }
    if (!Object.keys(changes).length) fail(400, 'noChanges');
    return db.$transaction(async (tx) => {
      await versioned(tx, a, b.version, data);
      if (b.reason) {
        await tx.comment.create({ data: { appealId: a.id, authorId: u.id, body: b.reason } });
        if (u.id !== a.authorId && !a.firstResponseAt)
          await tx.appeal.update({ where: { id: a.id }, data: { firstResponseAt: new Date() } });
      }
      await tx.history.create({
        data: {
          appealId: a.id,
          actorId: u.id,
          action: 'updated',
          changes: changes as Prisma.InputJsonValue,
          reason: b.reason,
        },
      });
      const updated = await tx.appeal.findUniqueOrThrow({ where: { id: a.id } });
      await notify(
        tx,
        updated,
        u.id,
        b.status === 'WAITING'
          ? 'clarification'
          : b.status && terminal.includes(b.status)
            ? 'result'
            : b.status
              ? 'status'
              : b.assigneeId !== undefined
                ? 'assigned'
                : 'updated',
      );
      return updated;
    });
  }
  if (p[0] === 'admin') {
    if (u.role !== 'ADMIN') fail(403, 'forbidden');
    if (p[1] === 'users' && !p[2]) {
      const b = z
        .object({
          login: z.string().regex(/^[a-z0-9._-]{3,80}$/),
          name: str.max(120),
          role: z.enum(['EMPLOYEE', 'RESPONSIBLE', 'MANAGER', 'ADMIN']),
          departmentId: id,
          password: z.string().min(12).max(256),
        })
        .parse(body);
      const { password, ...rest } = b;
      return db.user.create({
        data: { ...rest, passwordHash: await hash(password, { type: argon2id }) },
        select: safeUser,
      });
    }
    if (p[1] === 'users' && p[2]) {
      const b = z
        .object({
          blocked: z.boolean().optional(),
          deleted: z.boolean().optional(),
          role: z.enum(['EMPLOYEE', 'RESPONSIBLE', 'MANAGER', 'ADMIN']).optional(),
          departmentId: id.optional(),
          name: str.max(120).optional(),
          password: z.string().min(12).max(256).optional(),
        })
        .strict()
        .parse(body);
      if (p[2] === u.id && (b.deleted || b.blocked || (b.role && b.role !== 'ADMIN')))
        fail(400, 'selfBlock');
      const { password, deleted, ...rest } = b;
      return db.$transaction(async (tx) => {
        // Serialize administrator changes so two admins cannot concurrently remove the last active admin.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(128392)`;
        const target = await tx.user.findUniqueOrThrow({ where: { id: p[2] } });
        if (target.deletedAt && b.blocked === false && !('deleted' in b)) fail(400, 'validation');
        if (
          target.role === 'ADMIN' &&
          !target.blocked &&
          (b.deleted || b.blocked || (b.role && b.role !== 'ADMIN')) &&
          (await tx.user.count({ where: { role: 'ADMIN', blocked: false } })) <= 1
        )
          fail(400, 'lastAdmin');
        if (b.deleted || b.blocked || b.role === 'EMPLOYEE') {
          const assigned = await tx.appeal.findMany({
            where: { assigneeId: target.id, status: { notIn: terminal } },
          });
          for (const a of assigned) {
            await tx.appeal.update({
              where: { id: a.id },
              data: { assigneeId: null, version: { increment: 1 } },
            });
            await tx.history.create({
              data: {
                appealId: a.id,
                actorId: u.id,
                action: 'updated',
                changes: { assigneeId: { from: target.id, to: null } },
              },
            });
            await notify(tx, { ...a, assigneeId: null }, u.id, 'assigned');
          }
        }
        return tx.user.update({
          where: { id: p[2] },
          data: {
            ...rest,
            ...(deleted !== undefined
              ? { deletedAt: deleted ? new Date() : null, blocked: deleted }
              : {}),
            ...(password
              ? { passwordHash: await hash(password, { type: argon2id }), mustChangePassword: true }
              : {}),
            ...(password ||
            b.role ||
            b.departmentId ||
            b.blocked !== undefined ||
            deleted !== undefined
              ? { sessionVersion: { increment: 1 } }
              : {}),
          },
          select: safeUser,
        });
      });
    }
    if (p[1] === 'departments') {
      const b = z.object({ name: str.max(120) }).parse(body);
      return db.department.create({ data: b });
    }
    if (p[1] === 'categories') {
      const b = z
        .object({
          code: z.string().regex(/^[a-z0-9_-]{2,80}$/),
          ru: str.max(120),
          kk: str.max(120),
          en: str.max(120),
          active: z.boolean().optional(),
        })
        .parse(body);
      return db.category.upsert({ where: { code: b.code }, create: b, update: b });
    }
    if (p[1] === 'rules') {
      const b = z
        .object({ categoryId: id, departmentId: id.nullable(), assigneeId: id })
        .parse(body);
      const candidate = await db.user.findUnique({ where: { id: b.assigneeId } });
      if (!candidate || candidate.blocked || candidate.role === 'EMPLOYEE') fail(400, 'validation');
      const scope = b.categoryId + ':' + (b.departmentId ?? '*');
      return db.routingRule.upsert({ where: { scope }, create: { ...b, scope }, update: b });
    }
    if (p[1] === 'rule-delete') {
      const b = z.object({ id }).parse(body);
      await db.routingRule.delete({ where: { id: b.id } });
      return { ok: true };
    }
    if (p[1] === 'sla') {
      const b = z
        .object({
          HIGH: z.number().int().min(1).max(365),
          MEDIUM: z.number().int().min(1).max(365),
          LOW: z.number().int().min(1).max(365),
        })
        .parse(body);
      return db.setting.upsert({
        where: { key: 'sla' },
        create: { key: 'sla', value: b },
        update: { value: b },
      });
    }
  }
  fail(404, 'notFound');
}
async function upload(req: Request, u: User, appealId: string) {
  const a = await accessible(u, appealId);
  if (a.authorId !== u.id && !canManage(u, a)) fail(403, 'forbidden');
  if (Number(req.headers.get('content-length')) > 51 * 1024 * 1024) fail(413, 'fileSize');
  const form = await new Response(await limitedBody(req, 51 * 1024 * 1024), {
    headers: { 'Content-Type': req.headers.get('content-type') || '' },
  }).formData();
  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  const version = Number(form.get('version'));
  if (!Number.isSafeInteger(version) || version < 1) fail(400, 'validation');
  if (!files.length || files.length > 5) fail(400, 'fileCount');
  const allowed: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    txt: 'text/plain',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  const prepared: {
    buffer: Buffer;
    name: string;
    storageKey: string;
    mime: string;
    size: number;
  }[] = [];
  for (const f of files) {
    if (f.size > 10 * 1024 * 1024 || !f.size) fail(400, 'fileSize');
    const ext = f.name.split('.').pop()?.toLowerCase() || '';
    if (!allowed[ext]) fail(400, 'fileType');
    const buffer = Buffer.from(await f.arrayBuffer());
    let detected;
    try {
      detected = await fileTypeFromBuffer(buffer);
    } catch {
      fail(400, 'fileType');
    }
    if (ext === 'txt') {
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        if (buffer.includes(0)) fail(400, 'fileType');
      } catch {
        fail(400, 'fileType');
      }
    } else if (detected?.mime !== allowed[ext]) fail(400, 'fileType');
    prepared.push({
      buffer,
      name: path
        .basename(f.name)
        .replace(/[\r\n\x00-\x1f]/g, '')
        .slice(0, 200),
      storageKey: randomUUID(),
      mime: allowed[ext],
      size: f.size,
    });
  }
  const dir = process.env.UPLOAD_DIR || '.local/uploads';
  await mkdir(dir, { recursive: true });
  const written: string[] = [];
  try {
    for (const f of prepared) {
      await writeFile(path.join(/*turbopackIgnore: true*/ dir, f.storageKey), f.buffer, {
        flag: 'wx',
      });
      written.push(f.storageKey);
    }
    return await db.$transaction(async (tx) => {
      await versioned(tx, a, version, {});
      if ((await tx.attachment.count({ where: { appealId: a.id } })) + prepared.length > 5)
        fail(400, 'fileCount');
      await tx.attachment.createMany({
        data: prepared.map(({ buffer: _, ...f }) => ({ ...f, appealId: a.id })),
      });
      await tx.history.create({
        data: {
          appealId: a.id,
          actorId: u.id,
          action: 'filesAdded',
          changes: { names: prepared.map((f) => f.name) },
        },
      });
      await notify(tx, a, u.id, 'updated');
      return { ok: true };
    });
  } catch (e) {
    await Promise.all(
      written.map((k) => unlink(path.join(/*turbopackIgnore: true*/ dir, k)).catch(() => {})),
    );
    throw e;
  }
}
async function limitedBody(req: Request, limit: number) {
  const reader = req.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        fail(413, 'fileSize');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export async function handle(req: Request, segments: string[]) {
  try {
    if (!isAllowedLocalRequest(req, req.method !== 'GET')) fail(403, 'forbidden');
    const u = await currentUser();
    if (u.mustChangePassword && !['me', 'password'].includes(segments[0]))
      fail(403, 'passwordChangeRequired');
    let result: unknown;
    if (req.method === 'GET') result = await get(u, segments, new URL(req.url).searchParams);
    else if (segments[0] === 'appeals' && segments[2] === 'files')
      result = await upload(req, u, segments[1]);
    else {
      if (Number(req.headers.get('content-length')) > 100000) fail(413, 'validation');
      result = await post(
        u,
        segments,
        JSON.parse((await limitedBody(req, 100000)).toString('utf8')),
      );
    }
    if (result instanceof Response) return result;
    const anonymous = await db.appeal.findMany({
      where: { AND: [visibility(u), { anonymous: true }] },
      select: { id: true, authorId: true },
    });
    const aliases = new Map(anonymous.map((a) => [a.id, a.authorId]));
    const mask = (value: unknown, appealId?: string): unknown => {
      if (Array.isArray(value)) return value.map((v) => mask(v, appealId));
      if (!value || typeof value !== 'object' || value instanceof Date) return value;
      const v = value as Record<string, unknown>;
      const aid =
        typeof v.appealId === 'string'
          ? v.appealId
          : typeof v.id === 'string' && aliases.has(v.id)
            ? v.id
            : appealId;
      const author = aid ? aliases.get(aid) : undefined;
      const out = Object.fromEntries(Object.entries(v).map(([k, val]) => [k, mask(val, aid)]));
      if (author) {
        const label =
          { ru: 'Анонимный сотрудник', kk: 'Анонимді қызметкер', en: 'Anonymous employee' }[
            u.locale
          ] || 'Anonymous employee';
        if (v.authorId === author) {
          out.authorId = u.id === author ? author : '';
          if (v.author) out.author = { id: u.id === author ? author : '', name: label };
        }
        if (v.actorId === author && v.actor) {
          out.actorId = '';
          out.actor = { name: label };
        }
        if (v.assigneeId === author) {
          out.assigneeId = u.id === author ? author : '';
          if (v.assignee) out.assignee = { id: u.id === author ? author : '', name: label };
        }
        if (v.anonymous) {
          out.sourceAssignee = null;
          out.sourceAuthor = null;
        }
      }
      return out;
    };
    return Response.json(mask(result), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    if (e instanceof ApiError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError || e instanceof SyntaxError)
      return Response.json({ error: 'validation' }, { status: 400 });
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return Response.json({ error: 'duplicate' }, { status: 409 });
      if (['P2003', 'P2025'].includes(e.code))
        return Response.json({ error: 'notFound' }, { status: 404 });
    }
    console.error('API failure', e instanceof Error ? e.message : 'unknown');
    return Response.json({ error: 'serverError' }, { status: 500 });
  }
}
