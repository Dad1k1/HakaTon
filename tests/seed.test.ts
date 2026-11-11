import { describe, it, expect, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { db } from '../src/lib/db';
import source from '../data/dataset.json';
import { credentials } from './helpers';
const run = process.env.RUN_INTEGRATION === '1';
describe.skipIf(!run)('dataset integrity and safe repeated import', () => {
  afterAll(() => db.$disconnect());
  it('imports all source descriptions and preserves user changes and the number sequence', async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
      throw new Error('Dedicated _test database required');
    const cfg = await credentials();
    const seed = () =>
      promisify(execFile)(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/seed.ts'], {
        env: { ...process.env, DEMO_PASSWORD: cfg.password, ADMIN_PASSWORD: cfg.password },
      });
    await seed();
    for (const row of source) {
      const a = await db.appeal.findUniqueOrThrow({
        where: { number: row.number },
        include: { category: true },
      });
      expect(a.description).toBe(row.description);
      expect(a.recommendedNextStep).toBe(row.recommendedNextStep);
      expect(a.sourceAuthor).toBe(row.author);
      expect(a.sourceAssignee).toBe(row.assignee);
      expect(a.category.ru).toBe(row.category);
    }
    const before = await db.appeal.findUniqueOrThrow({ where: { number: 1 } });
    const edited = await db.appeal.update({
      where: { id: before.id },
      data: { title: 'User change preserved by import', version: { increment: 1 } },
    });
    await seed();
    const after = await db.appeal.findUniqueOrThrow({ where: { number: 1 } });
    expect(after.title).toBe(edited.title);
    expect(after.version).toBe(edited.version);
    expect(await db.appeal.count({ where: { number: { gte: 1, lte: 20 } } })).toBe(20);
    const max = await db.appeal.aggregate({ _max: { number: true } });
    const sequence = await db.$queryRaw<
      { last_value: bigint }[]
    >`SELECT last_value FROM "Appeal_number_seq"`;
    expect(Number(sequence[0].last_value)).toBeGreaterThanOrEqual(max._max.number!);
    await db.appeal.update({ where: { id: before.id }, data: { title: before.title } });
  });
});
