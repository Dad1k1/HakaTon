import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { APIRequestContext } from '@playwright/test';
import { client, data, credentials, baseURL } from './helpers';
import { db } from '../src/lib/db';
const run = process.env.RUN_INTEGRATION === '1';
describe.skipIf(!run)('real HTTP API + PostgreSQL', () => {
  let employee: APIRequestContext,
    responsible: APIRequestContext,
    manager: APIRequestContext,
    admin: APIRequestContext,
    other: APIRequestContext;
  let cfg: Awaited<ReturnType<typeof credentials>>;
  let appealId: string;
  let fileId: string;
  beforeAll(async () => {
    cfg = await credentials();
    [employee, responsible, manager, admin, other] = await Promise.all(
      ['employee', 'responsible', 'manager', 'admin', 'other'].map((k) =>
        client(cfg.users[k].login, cfg.password),
      ),
    );
  });
  afterAll(async () => {
    await Promise.all([employee, responsible, manager, admin, other].map((c) => c?.dispose()));
    await db.$disconnect();
  });
  it('creates sequential numbers, routes by category, leaves first response empty', async () => {
    const r = await data(employee, 'appeals', {
      title: 'QA workflow ' + Date.now(),
      description: 'Integration test appeal',
      type: 'PROBLEM',
      priority: 'HIGH',
      categoryId: cfg.categoryId,
    });
    expect(r.status()).toBe(200);
    const a = await r.json();
    appealId = a.id;
    expect(a.number).toBeGreaterThanOrEqual(21);
    expect(a.assigneeId).toBe(cfg.users.responsible.id);
    expect(a.firstResponseAt).toBeNull();
    expect(a.authorId).toBe(cfg.users.employee.id);
  });
  it('uploads verified file and rejects direct access by unrelated employee', async () => {
    const a = await (await data(employee, 'appeals/' + appealId)).json();
    const r = await employee.post('/api/data/appeals/' + appealId + '/files', {
      multipart: {
        version: String(a.version),
        files: { name: 'test.txt', mimeType: 'text/plain', buffer: Buffer.from('QA attachment') },
      },
    });
    expect(r.status()).toBe(200);
    const card = await (await data(employee, 'appeals/' + appealId)).json();
    fileId = card.attachments[0].id;
    expect((await data(other, 'appeals/' + appealId)).status()).toBe(404);
    expect((await other.get('/api/data/files/' + fileId)).status()).toBe(404);
    expect((await employee.get('/api/data/files/' + fileId)).status()).toBe(200);
    const bad = await employee.post('/api/data/appeals/' + appealId + '/files', {
      multipart: {
        version: String(card.version),
        files: { name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not a png') },
      },
    });
    expect(bad.status()).toBe(400);
  });
  it('rejects unauthorized changes and cross-origin writes', async () => {
    const a = await (await data(employee, 'appeals/' + appealId)).json();
    expect(
      (
        await data(employee, 'appeals/' + appealId, { version: a.version, status: 'REVIEW' })
      ).status(),
    ).toBe(403);
    expect(
      (
        await employee.post('/api/data/profile', {
          headers: { Origin: 'http://evil.invalid' },
          data: { name: 'CSRF' },
        })
      ).status(),
    ).toBe(403);
  });
  it('keeps one concurrent update and returns 409 for the other', async () => {
    const a = await (await data(responsible, 'appeals/' + appealId)).json();
    const results = await Promise.all([
      data(responsible, 'appeals/' + appealId, { version: a.version, status: 'REVIEW' }),
      data(manager, 'appeals/' + appealId, { version: a.version, priority: 'MEDIUM' }),
    ]);
    expect(results.map((r) => r.status()).sort()).toEqual([200, 409]);
    const current = await (await data(responsible, 'appeals/' + appealId)).json();
    if (current.status === 'NEW')
      expect(
        (
          await data(responsible, 'appeals/' + appealId, {
            version: current.version,
            status: 'REVIEW',
          })
        ).status(),
      ).toBe(200);
  });
  it('requires clarification comment, accepts author answer, records real first response', async () => {
    let a = await (await data(responsible, 'appeals/' + appealId)).json();
    expect(
      (
        await data(responsible, 'appeals/' + appealId, { version: a.version, status: 'WAITING' })
      ).status(),
    ).toBe(400);
    expect(
      (
        await data(responsible, 'appeals/' + appealId, {
          version: a.version,
          status: 'WAITING',
          reason: 'Which operation is affected?',
        })
      ).status(),
    ).toBe(200);
    a = await (await data(employee, 'appeals/' + appealId)).json();
    expect(a.firstResponseAt).not.toBeNull();
    expect(
      (
        await data(employee, 'appeals/' + appealId + '/comments', {
          version: a.version,
          body: 'The procurement operation.',
        })
      ).status(),
    ).toBe(200);
    a = await (await data(responsible, 'appeals/' + appealId)).json();
    expect(
      (
        await data(responsible, 'appeals/' + appealId, {
          version: a.version,
          status: 'IN_PROGRESS',
        })
      ).status(),
    ).toBe(200);
  });
  it('requires implemented actions and admin reason to reopen', async () => {
    let a = await (await data(responsible, 'appeals/' + appealId)).json();
    expect(
      (
        await data(responsible, 'appeals/' + appealId, {
          version: a.version,
          status: 'IMPLEMENTED',
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await data(responsible, 'appeals/' + appealId, {
          version: a.version,
          status: 'IMPLEMENTED',
          reason: 'Changed the local template.',
        })
      ).status(),
    ).toBe(200);
    a = await (await data(responsible, 'appeals/' + appealId)).json();
    expect(a.result).toBe('Changed the local template.');
    expect(
      (
        await data(manager, 'appeals/' + appealId, {
          version: a.version,
          status: 'REVIEW',
          reason: 'Recheck',
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await data(admin, 'appeals/' + appealId, {
          version: a.version,
          status: 'REVIEW',
          reason: 'Admin recheck',
        })
      ).status(),
    ).toBe(200);
  });
  it('search, filtered metrics and results share visibility', async () => {
    const where = 'q=QA%20workflow';
    const list = await (await data(employee, 'appeals?' + where)).json();
    const metrics = await (await data(employee, 'analytics?' + where)).json();
    expect(metrics.total).toBe(list.total);
    expect(list.items.some((a: { id: string }) => a.id === appealId)).toBe(true);
    const foreign = await (await data(other, 'appeals?' + where)).json();
    expect(foreign.items.some((a: { id: string }) => a.id === appealId)).toBe(false);
  });
  it('notifies participants, supports read state and current blocking', async () => {
    const n = await (await data(employee, 'notifications')).json();
    expect(n.some((v: { appealId: string }) => v.appealId === appealId)).toBe(true);
    expect((await data(employee, 'notifications', {})).status()).toBe(200);
    expect(
      (await data(admin, 'admin/users/' + cfg.users.other.id, { blocked: true })).status(),
    ).toBe(200);
    expect((await data(other, 'me')).status()).toBe(401);
    await data(admin, 'admin/users/' + cfg.users.other.id, { blocked: false });
  });
  it('skips blocked rule and falls back to manager, then administrator queue', async () => {
    await data(admin, 'admin/users/' + cfg.users.responsible.id, { blocked: true });
    const r = await data(employee, 'appeals', {
      title: 'QA fallback',
      description: 'Fallback check',
      type: 'SUGGESTION',
      priority: 'LOW',
      categoryId: cfg.categoryId,
    });
    expect((await r.json()).assigneeId).toBe(cfg.users.manager.id);
    await data(admin, 'admin/users/' + cfg.users.manager.id, { blocked: true });
    const q = await data(employee, 'appeals', {
      title: 'QA unassigned',
      description: 'Queue check',
      type: 'PRAISE',
      priority: 'LOW',
      categoryId: cfg.categoryId,
    });
    expect((await q.json()).assigneeId).toBeNull();
    const metrics = await (await data(admin, 'analytics?assigneeId=unassigned')).json();
    expect(metrics.unassigned).toBeGreaterThanOrEqual(1);
    await data(admin, 'admin/users/' + cfg.users.responsible.id, { blocked: false });
    await data(admin, 'admin/users/' + cfg.users.manager.id, { blocked: false });
  });
  it('limits login attempts and does not reveal blocked/unknown accounts', async () => {
    const unknown = await client('qa.nonexistent', cfg.password);
    expect((await data(unknown, 'me')).status()).toBe(401);
    await unknown.dispose();
    const blocked = await client('qa.blocked', cfg.password);
    expect((await data(blocked, 'me')).status()).toBe(401);
    await blocked.dispose();
    for (let i = 0; i < 11; i++) {
      const c = await client('qa.ratelimited', 'incorrect');
      await c.dispose();
    }
    const attempt = await db.loginAttempt.findMany({ where: { count: { gte: 11 } } });
    expect(attempt.length).toBeGreaterThan(0);
  });
});
