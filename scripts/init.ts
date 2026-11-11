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
  const login = process.env.ADMIN_LOGIN || 'admin';
  if (!(await db.user.findUnique({ where: { login } }))) {
    const password = process.env.ADMIN_PASSWORD;
    if (!password || password.length < 12)
      throw new Error('Set ADMIN_PASSWORD (12+ characters) for explicit initialization');
    await db.user.create({
      data: {
        login,
        name: 'Администратор',
        role: 'ADMIN',
        departmentId: department.id,
        passwordHash: await hash(password, { type: argon2id }),
        mustChangePassword: true,
      },
    });
  }
}
if (process.argv[1]?.endsWith('init.ts'))
  initialize()
    .then(() => console.log('Initialization completed; existing accounts preserved.'))
    .finally(() => db.$disconnect());
