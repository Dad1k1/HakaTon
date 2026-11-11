import 'dotenv/config';
import { hash, argon2id } from 'argon2';
import { db } from '../src/lib/db';
import { initialize } from './init';
import { accounts } from './catalog';
import { importDataset } from './import';
import rows from '../data/dataset.json';
async function seed() {
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 12)
    throw new Error('Set DEMO_PASSWORD (12+ characters) to explicitly create demo accounts');
  await initialize();
  const passwordHash = await hash(password, { type: argon2id });
  for (const [login, name, dept, role] of accounts) {
    const department = await db.department.upsert({
      where: { name: dept },
      create: { name: dept },
      update: {},
    });
    await db.user.upsert({
      where: { login },
      create: { login, name, role, departmentId: department.id, passwordHash },
      update: {},
    });
  }
  const initialized = await db.setting.findUnique({ where: { key: 'demoRoutingInitialized' } });
  if (!initialized) {
    for (const row of rows) {
      const category = await db.category.findFirstOrThrow({ where: { ru: row.category } });
      const author = await db.user.findFirstOrThrow({ where: { name: row.author } });
      const assignee = await db.user.findFirstOrThrow({ where: { name: row.assignee } });
      const scope = category.id + ':' + author.departmentId;
      await db.routingRule.upsert({
        where: { scope },
        create: {
          categoryId: category.id,
          departmentId: author.departmentId,
          assigneeId: assignee.id,
          scope,
        },
        update: {},
      });
    }
    await db.setting.create({ data: { key: 'demoRoutingInitialized', value: true } });
  }
  await importDataset();
  console.log('Demo imported. All passwords are temporary; see .env and docs/demo-accounts.md.');
}
seed().finally(() => db.$disconnect());
