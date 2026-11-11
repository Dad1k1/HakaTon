import { Appeal, Prisma, Role, Status, User } from '@prisma/client';
export const terminal: Status[] = ['IMPLEMENTED', 'REJECTED', 'CLOSED'];
export const transitions: Record<Status, Status[]> = {
  NEW: ['REVIEW'],
  REVIEW: ['IN_PROGRESS', 'WAITING', 'REJECTED', 'CLOSED'],
  IN_PROGRESS: ['WAITING', 'IMPLEMENTED', 'REJECTED', 'CLOSED'],
  WAITING: ['REVIEW', 'IN_PROGRESS', 'REJECTED', 'CLOSED'],
  IMPLEMENTED: [],
  REJECTED: [],
  CLOSED: [],
};
export function visibility(u: Pick<User, 'id' | 'role' | 'departmentId'>): Prisma.AppealWhereInput {
  return u.role === 'ADMIN'
    ? {}
    : {
        OR: [
          { authorId: u.id },
          { assigneeId: u.id },
          ...(u.role === 'MANAGER' ? [{ departmentId: u.departmentId }] : []),
        ],
      };
}
export function canSee(
  u: Pick<User, 'id' | 'role' | 'departmentId'>,
  a: Pick<Appeal, 'authorId' | 'assigneeId' | 'departmentId'>,
) {
  return (
    u.role === 'ADMIN' ||
    a.authorId === u.id ||
    a.assigneeId === u.id ||
    (u.role === 'MANAGER' && a.departmentId === u.departmentId)
  );
}
export function canManage(
  u: Pick<User, 'id' | 'role' | 'departmentId'>,
  a: Pick<Appeal, 'assigneeId' | 'departmentId'>,
) {
  return (
    u.role === 'ADMIN' ||
    a.assigneeId === u.id ||
    (u.role === 'MANAGER' && a.departmentId === u.departmentId)
  );
}
export function canAssign(u: Pick<User, 'role' | 'departmentId'>, a: Pick<Appeal, 'departmentId'>) {
  return u.role === 'ADMIN' || (u.role === 'MANAGER' && u.departmentId === a.departmentId);
}
export function validTransition(from: Status, to: Status, role: Role, reason?: string) {
  if (!reason?.trim() && ['WAITING', 'REJECTED', 'CLOSED', 'IMPLEMENTED'].includes(to))
    return false;
  if (terminal.includes(from)) return role === 'ADMIN' && to === 'REVIEW' && !!reason?.trim();
  return transitions[from].includes(to);
}
export function overdue(a: Pick<Appeal, 'dueAt' | 'status'>, now = new Date()) {
  return a.dueAt < now && !terminal.includes(a.status);
}
export function metrics(
  rows: Pick<
    Appeal,
    'status' | 'dueAt' | 'type' | 'categoryId' | 'createdAt' | 'firstResponseAt'
  >[],
  now = new Date(),
) {
  const group = (key: 'status' | 'type' | 'categoryId') =>
    rows.reduce<Record<string, number>>((a, r) => ((a[r[key]] = (a[r[key]] || 0) + 1), a), {});
  const response = rows
    .filter((r) => r.firstResponseAt)
    .map((r) => Math.max(0, r.firstResponseAt!.getTime() - r.createdAt.getTime()));
  return {
    total: rows.length,
    completed: rows.filter((r) => terminal.includes(r.status)).length,
    completedRate: rows.length
      ? rows.filter((r) => terminal.includes(r.status)).length / rows.length
      : null,
    implemented: rows.filter((r) => r.status === 'IMPLEMENTED').length,
    overdue: rows.filter((r) => overdue(r, now)).length,
    firstResponseHours: response.length
      ? response.reduce((a, b) => a + b, 0) / response.length / 3600000
      : null,
    byStatus: group('status'),
    byType: group('type'),
    byCategory: group('categoryId'),
  };
}
export function routeCandidate(
  exact: { assigneeId: string; blocked: boolean } | undefined,
  general: { assigneeId: string; blocked: boolean } | undefined,
  manager: { id: string } | undefined,
) {
  return (
    (exact && !exact.blocked ? exact.assigneeId : null) ||
    (general && !general.blocked ? general.assigneeId : null) ||
    manager?.id ||
    null
  );
}
export const numberLabel = (n: number) => `A-${String(n).padStart(3, '0')}`;
