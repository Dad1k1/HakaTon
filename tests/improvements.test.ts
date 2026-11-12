import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { client, data, credentials } from './helpers';
import { db } from '../src/lib/db';
import type { APIRequestContext } from '@playwright/test';
describe.skipIf(process.env.RUN_INTEGRATION !== '1')(
  'targeted improvements with PostgreSQL',
  () => {
    let employee: APIRequestContext,
      admin: APIRequestContext,
      responsible: APIRequestContext,
      other: APIRequestContext;
    let cfg: Awaited<ReturnType<typeof credentials>>, appealId: string;
    beforeAll(async () => {
      cfg = await credentials();
      await db.routingRule.upsert({
        where: { scope: cfg.categoryId + ':' + cfg.departmentId },
        create: {
          scope: cfg.categoryId + ':' + cfg.departmentId,
          categoryId: cfg.categoryId,
          departmentId: cfg.departmentId,
          assigneeId: cfg.users.responsible.id,
        },
        update: { assigneeId: cfg.users.responsible.id },
      });
      [employee, admin, responsible, other] = await Promise.all(
        ['employee', 'admin', 'responsible', 'other'].map((r) =>
          client(cfg.users[r].login, cfg.password),
        ),
      );
    });
    afterAll(async () => {
      await Promise.all([employee, admin, responsible, other].map((c) => c?.dispose()));
      await db.$disconnect();
    });
    const card = async (c = employee) => (await data(c, 'appeals/' + appealId)).json();
    it('masks anonymous authors in cards, lists, comments and history, keeps access private', async () => {
      const response = await data(employee, 'appeals', {
        title: 'Anonymous regression',
        description: 'Anonymous body',
        type: 'PROBLEM',
        categoryId: cfg.categoryId,
        priority: 'HIGH',
        anonymous: true,
      });
      expect(response.status()).toBe(200);
      appealId = (await response.json()).id;
      let a = await card();
      expect(a.authorId).toBe(cfg.users.employee.id);
      await data(employee, 'appeals/' + appealId + '/comments', {
        version: a.version,
        body: 'Private author comment',
      });
      a = await card(admin);
      expect(a.author.name).toBe('Анонимный сотрудник');
      expect(a.authorId).toBe('');
      expect(a.comments[0].author.name).toBe('Анонимный сотрудник');
      expect(JSON.stringify(a)).not.toContain(cfg.users.employee.id);
      expect((await data(other, 'appeals/' + appealId)).status()).toBe(404);
      const list = await (await data(admin, 'appeals?q=Anonymous regression')).json();
      expect(list.items[0].authorId).toBe('');
    });
    it('allows editing/deleting own messages, blocks other participants, and enforces versions', async () => {
      let a = await card();
      const id = a.comments[0].id;
      expect(
        (
          await data(responsible, `appeals/${appealId}/comments/${id}`, {
            version: a.version,
            action: 'edit',
            body: 'Hijack',
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await data(employee, `appeals/${appealId}/comments/${id}`, {
            version: a.version,
            action: 'edit',
            body: 'Edited author comment',
          })
        ).status(),
      ).toBe(200);
      expect(
        (
          await data(employee, `appeals/${appealId}/comments/${id}`, {
            version: a.version,
            action: 'delete',
          })
        ).status(),
      ).toBe(409);
      a = await card();
      expect(a.comments[0].body).toBe('Edited author comment');
      expect(
        (
          await data(employee, `appeals/${appealId}/comments/${id}`, {
            version: a.version,
            action: 'delete',
          })
        ).status(),
      ).toBe(200);
      a = await card();
      expect(a.comments).toHaveLength(0);
      await data(employee, `appeals/${appealId}/comments`, {
        version: a.version,
        body: 'Keep history',
      });
      a = await card();
      expect(
        (
          await data(employee, `appeals/${appealId}/discussion-delete`, { version: a.version })
        ).status(),
      ).toBe(403);
      expect(
        (
          await data(admin, `appeals/${appealId}/discussion-delete`, { version: a.version })
        ).status(),
      ).toBe(200);
      a = await card();
      expect(a.comments).toHaveLength(0);
      expect(a.history.some((h: { action: string }) => h.action === 'discussionDeleted')).toBe(
        true,
      );
    });
    it('schedules durable reminders and does not read them before they are due', async () => {
      const r = await data(employee, `appeals/${appealId}/reminder`, { minutes: 30 });
      expect(r.status()).toBe(200);
      const n = await r.json();
      expect(new Date(n.deliverAt).getTime()).toBeGreaterThan(Date.now() + 29 * 60000);
      await data(employee, 'notifications', {});
      expect((await db.notification.findUniqueOrThrow({ where: { id: n.id } })).readAt).toBeNull();
      expect(
        (await (await data(employee, 'notifications')).json()).some(
          (v: { id: string }) => v.id === n.id,
        ),
      ).toBe(false);
      await db.notification.update({
        where: { id: n.id },
        data: { deliverAt: new Date(Date.now() - 1000) },
      });
      expect(
        (await (await data(employee, 'notifications')).json()).some(
          (v: { id: string }) => v.id === n.id,
        ),
      ).toBe(true);
    });
    it('only lets the author close and rate after a substantive response', async () => {
      let a = await card();
      expect(
        (
          await data(employee, `appeals/${appealId}/complete`, {
            version: a.version,
            rating: 5,
            reason: 'Satisfied',
          })
        ).status(),
      ).toBe(400);
      await data(responsible, `appeals/${appealId}`, {
        version: a.version,
        status: 'REVIEW',
        reason: 'We have reviewed the issue.',
      });
      a = await card();
      expect(
        (
          await data(admin, `appeals/${appealId}/complete`, {
            version: a.version,
            rating: 5,
            reason: 'Satisfied',
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await data(employee, `appeals/${appealId}/complete`, {
            version: a.version,
            rating: 6,
            reason: 'Satisfied',
          })
        ).status(),
      ).toBe(400);
      expect(
        (
          await data(employee, `appeals/${appealId}/complete`, {
            version: a.version,
            rating: 5,
            reason: 'Satisfied',
          })
        ).status(),
      ).toBe(200);
      a = await card();
      expect(a.status).toBe('CLOSED');
      expect(a.rating).toBe(5);
    });
    it('allows closure after a reply without an intermediate status and preserves implemented results', async () => {
      const make = async () =>
        await (
          await data(employee, 'appeals', {
            title: 'Response completion regression',
            description: 'Satisfied after reply',
            type: 'PROBLEM',
            priority: 'MEDIUM',
            categoryId: cfg.categoryId,
          })
        ).json();
      let a = await make();
      await data(admin, `appeals/${a.id}/comments`, {
        version: a.version,
        body: 'Here is the answer.',
      });
      a = await (await data(employee, 'appeals/' + a.id)).json();
      expect(a.status).toBe('NEW');
      expect(
        (
          await data(employee, `appeals/${a.id}/complete`, {
            version: a.version,
            rating: 4,
            reason: 'Resolved',
          })
        ).status(),
      ).toBe(200);
      a = await make();
      for (const status of ['REVIEW', 'IN_PROGRESS', 'IMPLEMENTED']) {
        await data(admin, 'appeals/' + a.id, {
          version: a.version,
          status,
          reason: 'Work performed',
        });
        a = await (await data(employee, 'appeals/' + a.id)).json();
      }
      expect(
        (
          await data(employee, `appeals/${a.id}/complete`, {
            version: a.version,
            rating: 5,
            reason: 'Satisfied',
          })
        ).status(),
      ).toBe(200);
      a = await (await data(employee, 'appeals/' + a.id)).json();
      expect(a.status).toBe('IMPLEMENTED');
      expect(a.rating).toBe(5);
      expect(a.result).toBe('Work performed');
    });
    it('persists first-login preferences and changes/restores user roles safely', async () => {
      expect(
        (
          await data(employee, 'profile', { guideDismissed: true, locale: 'kk', theme: 'dark' })
        ).status(),
      ).toBe(200);
      const u = await (await data(employee, 'me')).json();
      expect(u.guideDismissed).toBe(true);
      expect(u.locale).toBe('kk');
      await data(employee, 'profile', { locale: 'ru', theme: 'light' });
      const path = 'admin/users/' + cfg.users.other.id;
      expect((await data(admin, path, { role: 'RESPONSIBLE' })).status()).toBe(200);
      expect((await data(other, 'me')).status()).toBe(401);
      expect((await data(admin, path, { deleted: true })).status()).toBe(200);
      const deleted = await db.user.findUniqueOrThrow({ where: { id: cfg.users.other.id } });
      expect(deleted.deletedAt).not.toBeNull();
      expect((await data(admin, path, { deleted: false })).status()).toBe(200);
      const restored = await db.user.findUniqueOrThrow({ where: { id: cfg.users.other.id } });
      expect(restored.role).toBe('RESPONSIBLE');
      expect(restored.blocked).toBe(false);
      await data(admin, path, { role: 'EMPLOYEE' });
      expect(
        (await data(admin, 'admin/users/' + cfg.users.admin.id, { deleted: true })).status(),
      ).toBe(400);
    });
  },
);
