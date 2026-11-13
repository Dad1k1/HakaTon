import 'dotenv/config';
import { hash, argon2id } from 'argon2';
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
  const installed = await db.setting.findUnique({ where: { key: 'simpleAccountsInitialized' } });
  for (const [login, password, name, role] of [
    ['admin', 'ADMIN', 'Администратор', 'ADMIN'],
    ['user', 'USER', 'Пользователь', 'EMPLOYEE'],
  ] as const) {
    const passwordHash = await hash(password, { type: argon2id });
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
      update: installed
        ? { mustChangePassword: false }
        : {
            passwordHash,
            role,
            blocked: false,
            deletedAt: null,
            mustChangePassword: false,
            sessionVersion: { increment: 1 },
          },
    });
  }
  await db.user.updateMany({
    where: { mustChangePassword: true },
    data: { mustChangePassword: false },
  });
  await db.setting.upsert({
    where: { key: 'simpleAccountsInitialized' },
    create: { key: 'simpleAccountsInitialized', value: true },
    update: {},
  });
}
if (process.argv[1]?.endsWith('init.ts'))
  initialize()
    .then(() => console.log('Initialization completed; existing accounts preserved.'))
    .finally(() => db.$disconnect());
