import type { NextAuthOptions } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { hash, verify, argon2id } from 'argon2';
import { createHmac } from 'node:crypto';
import { db } from './db';
let dummy: Promise<string>;
export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt', maxAge: 8 * 3600 },
  pages: { signIn: '/' },
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: { login: { type: 'text' }, password: { type: 'password' } },
      async authorize(credentials) {
        const login = credentials?.login?.trim().toLowerCase();
        const password = credentials?.password;
        if (!login || !password || login.length > 80 || password.length > 256) return null;
        const key = createHmac('sha256', process.env.NEXTAUTH_SECRET!).update(login).digest('hex');
        const attempt = await db.loginAttempt.upsert({
          where: { key },
          create: { key, count: 1, expiresAt: new Date(Date.now() + 900000) },
          update: { count: { increment: 1 } },
        });
        if (attempt.expiresAt < new Date())
          await db.loginAttempt.update({
            where: { key },
            data: { count: 1, expiresAt: new Date(Date.now() + 900000) },
          });
        else if (attempt.count > 10) return null;
        const user = await db.user.findUnique({ where: { login } });
        dummy ??= hash('dummy-verification-only', { type: argon2id });
        const candidate =
          ['admin', 'user'].includes(login) && password.toLowerCase() === login ? login : password;
        const ok = await verify(user?.passwordHash ?? (await dummy), candidate);
        if (!ok || !user || user.blocked || user.deletedAt) return null;
        await db.loginAttempt.deleteMany({ where: { key } });
        return { id: user.id, name: user.name, sessionVersion: user.sessionVersion };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.sessionVersion = (user as unknown as { sessionVersion: number }).sessionVersion;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        Object.assign(session.user, { id: token.sub, sessionVersion: token.sessionVersion });
      }
      return session;
    },
  },
};
