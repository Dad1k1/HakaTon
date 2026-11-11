import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { hash, argon2id } from 'argon2';
import { db } from '../src/lib/db';
export async function fixtures() {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
    throw new Error('Tests require a dedicated database whose name ends with _test');
  const password = randomBytes(24).toString('base64url');
  const passwordHash = await hash(password, { type: argon2id });
  const d1 = await db.department.upsert({
    where: { name: 'QA Department' },
    create: { name: 'QA Department' },
    update: {},
  });
  const d2 = await db.department.upsert({
    where: { name: 'QA Other' },
    create: { name: 'QA Other' },
    update: {},
  });
  const users: Record<string, { id: string; login: string }> = {};
  for (const [name, role, dept] of [
    ['employee', 'EMPLOYEE', d1.id],
    ['responsible', 'RESPONSIBLE', d1.id],
    ['manager', 'MANAGER', d1.id],
    ['admin', 'ADMIN', d1.id],
    ['other', 'EMPLOYEE', d2.id],
    ['blocked', 'EMPLOYEE', d1.id],
    ['temporary', 'EMPLOYEE', d1.id],
  ] as const) {
    const u = await db.user.upsert({
      where: { login: 'qa.' + name },
      create: {
        login: 'qa.' + name,
        name: 'QA ' + name,
        role,
        departmentId: dept,
        passwordHash,
        blocked: name === 'blocked',
        mustChangePassword: name === 'temporary',
      },
      update: {
        passwordHash,
        role,
        blocked: name === 'blocked',
        mustChangePassword: name === 'temporary',
        locale: 'ru',
        theme: 'light',
        sessionVersion: { increment: 1 },
      },
    });
    users[name] = { id: u.id, login: u.login };
  }
  const category = await db.category.upsert({
    where: { code: 'qa' },
    create: { code: 'qa', ru: 'Тестовая категория', kk: 'Сынақ санаты', en: 'Test category' },
    update: { active: true },
  });
  await db.loginAttempt.deleteMany();
  await db.routingRule.upsert({
    where: { scope: category.id + ':' + d1.id },
    create: {
      scope: category.id + ':' + d1.id,
      categoryId: category.id,
      departmentId: d1.id,
      assigneeId: users.responsible.id,
    },
    update: { assigneeId: users.responsible.id },
  });
  await db.setting.upsert({
    where: { key: 'sla' },
    create: { key: 'sla', value: { HIGH: 2, MEDIUM: 5, LOW: 10 } },
    update: {},
  });
  const result = {
    password,
    users,
    categoryId: category.id,
    departmentId: d1.id,
    otherDepartmentId: d2.id,
  };
  await mkdir('.local', { recursive: true });
  await writeFile('.local/test-credentials.json', JSON.stringify(result), { mode: 0o600 });
  return result;
}
if (process.argv[1]?.endsWith('test-fixtures.ts'))
  fixtures()
    .then(() => console.log('Isolated test fixtures initialized.'))
    .finally(() => db.$disconnect());
