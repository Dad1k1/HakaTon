import 'dotenv/config';
import { hash, verify, argon2id } from 'argon2';
import { db } from '../src/lib/db';
import { categories } from './catalog';
export async function initialize() {
  for (const [code, ru, kk, en] of categories)
    await db.category.upsert({ where: { code }, create: { code, ru, kk, en }, update: {} });
  const department = await db.department.upsert({
    where: { name: 'Управление' },
    create: { name: 'Управление' },
    update: {},
  });
  await db.setting.upsert({
    where: { key: 'sla' },
    create: { key: 'sla', value: { HIGH: 2, MEDIUM: 5, LOW: 10 } },
    update: {},
  });
  for (const [login, password, name, role] of [
    ['admin', 'admin', 'Администратор', 'ADMIN'],
    ['user', 'user', 'Пользователь', 'EMPLOYEE'],
  ] as const) {
    const existing = await db.user.findUnique({ where: { login } });
    const matches = existing
      ? await verify(existing.passwordHash, password).catch(() => false)
      : false;
    const passwordHash = matches
      ? existing!.passwordHash
      : await hash(password, { type: argon2id });
    await db.user.upsert({
      where: { login },
      create: {
        login,
        name,
        role,
        departmentId: department.id,
        passwordHash,
        mustChangePassword: false,
      },
      update: process.argv.includes('--reset-defaults')
        ? {
            passwordHash,
            role,
            blocked: false,
            deletedAt: null,
            mustChangePassword: false,
            sessionVersion: { increment: 1 },
          }
        : {},
    });
  }
  if (process.argv.includes('--reset-defaults')) await db.loginAttempt.deleteMany();
  await db.setting.upsert({
    where: { key: 'simpleAccountsInitialized' },
    create: { key: 'simpleAccountsInitialized', value: true },
    update: {},
  });
}
if (process.argv[1]?.endsWith('init.ts'))
  initialize()
    .then(() =>
      console.log('Accounts initialized. Existing credentials and account restrictions preserved.'),
    )
    .finally(() => db.$disconnect());
