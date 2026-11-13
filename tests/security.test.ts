import { it, expect, describe } from 'vitest';
import {
  readLimitedBody,
  BodyLimitError,
  safeRasterDimensions,
  consumeLoginBudget,
} from '../src/lib/security';
import { db } from '../src/lib/db';
import { initialize } from '../scripts/init';
import { hash, argon2id } from 'argon2';
it('rejects chunked bodies beyond the limit', async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(8));
      controller.enqueue(new Uint8Array(8));
      controller.close();
    },
  });
  const request = new Request('http://localhost', {
    method: 'POST',
    body,
    duplex: 'half',
  } as RequestInit);
  await expect(readLimitedBody(request, 10)).rejects.toBeInstanceOf(BodyLimitError);
});
it('rejects huge or malformed raster dimensions before decoding', () => {
  const png = Buffer.alloc(24);
  png.write('IHDR', 12);
  png.writeUInt32BE(192, 16);
  png.writeUInt32BE(192, 20);
  expect(safeRasterDimensions(png, 'image/png', 1048576)).toBe(true);
  png.writeUInt32BE(100000, 16);
  expect(safeRasterDimensions(png, 'image/png')).toBe(false);
  expect(safeRasterDimensions(Buffer.from([255, 216, 255, 192, 0, 1]), 'image/jpeg')).toBe(false);
});
describe.skipIf(process.env.RUN_INTEGRATION !== '1')('shared login budget', () => {
  it('preserves credentials, restrictions and login counters during normal initialization', async () => {
    if (!process.env.DATABASE_URL?.endsWith('_test'))
      throw new Error('Dedicated test database required');
    await initialize();
    const previous = await db.user.findUniqueOrThrow({ where: { login: 'admin' } });
    const key = 'security-init-budget';
    try {
      const restricted = await db.user.update({
        where: { id: previous.id },
        data: {
          blocked: true,
          passwordHash: await hash('changed-security-test-password', { type: argon2id }),
          sessionVersion: { increment: 1 },
        },
      });
      await db.loginAttempt.upsert({
        where: { key },
        create: { key, count: 9, expiresAt: new Date(Date.now() + 60000) },
        update: { count: 9 },
      });
      await initialize();
      const after = await db.user.findUniqueOrThrow({ where: { id: previous.id } });
      expect(after.passwordHash).toBe(restricted.passwordHash);
      expect(after.sessionVersion).toBe(restricted.sessionVersion);
      expect(after.blocked).toBe(true);
      expect((await db.loginAttempt.findUniqueOrThrow({ where: { key } })).count).toBe(9);
    } finally {
      await db.user.update({
        where: { id: previous.id },
        data: {
          blocked: previous.blocked,
          passwordHash: previous.passwordHash,
          sessionVersion: previous.sessionVersion,
        },
      });
      await db.loginAttempt.deleteMany({ where: { key } });
    }
  });
  it('does not exceed the limit under concurrent requests', async () => {
    const key = 'security-test-budget';
    await db.loginAttempt.deleteMany({ where: { key } });
    try {
      const results = await Promise.all(
        Array.from({ length: 15 }, () => consumeLoginBudget(key, 10, 60000)),
      );
      expect(results.filter(Boolean)).toHaveLength(10);
    } finally {
      await db.loginAttempt.deleteMany({ where: { key } });
      await db.$disconnect();
    }
  });
});
