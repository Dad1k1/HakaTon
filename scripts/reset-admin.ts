import 'dotenv/config';
import { hash, argon2id } from 'argon2';
import { db } from '../src/lib/db';

async function resetAdmin() {
  const login = process.env.ADMIN_LOGIN?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!login || !password || password.length < 12 || password.length > 256) {
    throw new Error('Set ADMIN_LOGIN and ADMIN_PASSWORD (12–256 characters) in .env.');
  }

  const user = await db.user.findUnique({ where: { login } });
  if (!user || user.role !== 'ADMIN') {
    throw new Error(`No administrator account found for ADMIN_LOGIN=${login}.`);
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hash(password, { type: argon2id }),
      blocked: false,
      mustChangePassword: true,
      sessionVersion: { increment: 1 },
    },
  });

  console.log(`Administrator ${login} reset. Sign in with ADMIN_PASSWORD and choose a new password.`);
}

resetAdmin()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Administrator reset failed.');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
