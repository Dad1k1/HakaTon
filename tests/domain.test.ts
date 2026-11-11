import { describe, it, expect } from 'vitest';
import {
  canSee,
  canManage,
  canAssign,
  validTransition,
  metrics,
  overdue,
  routeCandidate,
  terminal,
  visibility,
} from '../src/lib/domain';
import type { Role, Status, AppealType } from '@prisma/client';
import ru from '../src/messages/ru.json';
import kk from '../src/messages/kk.json';
import en from '../src/messages/en.json';
const appeal = { authorId: 'author', assigneeId: 'assigned', departmentId: 'd1' };
describe('cumulative access', () => {
  for (const role of ['EMPLOYEE', 'RESPONSIBLE', 'MANAGER', 'ADMIN'] as Role[])
    it(role + ' sees own and assigned, with role-specific scope', () => {
      expect(canSee({ id: 'author', role, departmentId: 'other' }, appeal)).toBe(true);
      expect(canSee({ id: 'assigned', role, departmentId: 'other' }, appeal)).toBe(true);
      expect(canSee({ id: 'stranger', role, departmentId: 'd1' }, appeal)).toBe(
        ['MANAGER', 'ADMIN'].includes(role),
      );
      expect(canSee({ id: 'stranger', role, departmentId: 'other' }, appeal)).toBe(
        role === 'ADMIN',
      );
      expect(canManage({ id: 'author', role, departmentId: 'other' }, appeal)).toBe(
        role === 'ADMIN',
      );
      expect(canAssign({ role, departmentId: 'd1' }, appeal)).toBe(
        ['MANAGER', 'ADMIN'].includes(role),
      );
    });
  it('manager visibility combines own, assigned and department', () =>
    expect(visibility({ id: 'm', role: 'MANAGER', departmentId: 'd1' })).toEqual({
      OR: [{ authorId: 'm' }, { assigneeId: 'm' }, { departmentId: 'd1' }],
    }));
});
describe('routing fallback', () => {
  it('prefers exact active match', () =>
    expect(
      routeCandidate(
        { assigneeId: 'exact', blocked: false },
        { assigneeId: 'general', blocked: false },
        { id: 'manager' },
      ),
    ).toBe('exact'));
  it('skips blocked exact match', () =>
    expect(
      routeCandidate(
        { assigneeId: 'exact', blocked: true },
        { assigneeId: 'general', blocked: false },
        { id: 'manager' },
      ),
    ).toBe('general'));
  it('uses manager after blocked or missing rules', () =>
    expect(
      routeCandidate(undefined, { assigneeId: 'general', blocked: true }, { id: 'manager' }),
    ).toBe('manager'));
  it('leaves admin queue when no candidate exists', () =>
    expect(routeCandidate(undefined, undefined, undefined)).toBe(null));
});
describe('state machine', () => {
  it('requires actual review before implementation', () => {
    expect(validTransition('NEW', 'IMPLEMENTED', 'ADMIN', 'done')).toBe(false);
    expect(validTransition('REVIEW', 'IN_PROGRESS', 'RESPONSIBLE')).toBe(true);
  });
  for (const from of ['REVIEW', 'IN_PROGRESS', 'WAITING'] as Status[])
    for (const to of ['REJECTED', 'CLOSED'] as Status[])
      it(`${from} -> ${to} requires explanation`, () => {
        expect(validTransition(from, to, 'RESPONSIBLE')).toBe(false);
        expect(validTransition(from, to, 'RESPONSIBLE', 'Reason')).toBe(true);
      });
  it('requires actions for implemented, question for waiting', () => {
    expect(validTransition('IN_PROGRESS', 'IMPLEMENTED', 'ADMIN', ' ')).toBe(false);
    expect(validTransition('IN_PROGRESS', 'IMPLEMENTED', 'ADMIN', 'Done')).toBe(true);
    expect(validTransition('REVIEW', 'WAITING', 'RESPONSIBLE')).toBe(false);
    expect(validTransition('REVIEW', 'WAITING', 'RESPONSIBLE', 'Question')).toBe(true);
  });
  for (const from of terminal)
    it('only admin can reopen ' + from + ' with a reason', () => {
      expect(validTransition(from, 'REVIEW', 'MANAGER', 'Recheck')).toBe(false);
      expect(validTransition(from, 'REVIEW', 'ADMIN')).toBe(false);
      expect(validTransition(from, 'REVIEW', 'ADMIN', 'Recheck')).toBe(true);
    });
});
describe('metrics', () => {
  const now = new Date('2026-11-11T12:00:00Z');
  const row = (status: Status, response: number | null) => ({
    status,
    type: 'PROBLEM' as AppealType,
    categoryId: 'c',
    createdAt: new Date('2026-11-01T10:00:00Z'),
    firstResponseAt:
      response === null ? null : new Date(Date.parse('2026-11-01T10:00:00Z') + response * 3600000),
    dueAt: new Date('2026-11-10T10:00:00Z'),
  });
  it('does not count terminal or future appeals as overdue; waiting does not pause due date', () => {
    expect(overdue(row('WAITING', null), now)).toBe(true);
    expect(overdue(row('IMPLEMENTED', 2), now)).toBe(false);
    expect(overdue({ ...row('NEW', null), dueAt: new Date('2026-11-12') }, now)).toBe(false);
  });
  it('completion includes all terminal statuses; assignment is not a response', () => {
    const m = metrics(
      [
        row('NEW', null),
        row('WAITING', 2),
        row('IMPLEMENTED', 4),
        row('REJECTED', 6),
        row('CLOSED', 8),
      ],
      now,
    );
    expect(m.completedRate).toBe(0.6);
    expect(m.firstResponseHours).toBe(5);
    expect(m.overdue).toBe(2);
    expect(m.implemented).toBe(1);
    expect(m.byType.PROBLEM).toBe(5);
  });
  it('reports no data instead of a misleading zero', () => {
    expect(metrics([], now).completedRate).toBeNull();
    expect(metrics([row('NEW', null)], now).firstResponseHours).toBeNull();
  });
});
it('translations cover identical keys in all languages', () => {
  const keys = (v: object, p = ''): string[] =>
    Object.entries(v).flatMap(([k, a]) => (typeof a === 'object' ? keys(a, p + k + '.') : [p + k]));
  expect(keys(kk)).toEqual(keys(ru));
  expect(keys(en)).toEqual(keys(ru));
});
