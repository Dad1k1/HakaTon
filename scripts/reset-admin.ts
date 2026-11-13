import 'dotenv/config';
import { hash, argon2id } from 'argon2';
import { db } from '../src/lib/db';

async function resetAdmin() {
  const login = 'admin';
  const password = 'admin';

  const user = await db.user.findUnique({ where: { login } });
  if (!user || user.role !== 'ADMIN') {
    throw new Error(`No administrator account found for ADMIN_LOGIN=${login}.`);
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hash(password, { type: argon2id }),
      blocked: false,
      mustChangePassword: false,
      sessionVersion: { increment: 1 },
    },
  });

  console.log(`Administrator ${login} restored. Sign in with admin / admin.`);
}

resetAdmin()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Administrator reset failed.');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
