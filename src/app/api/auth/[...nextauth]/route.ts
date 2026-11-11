import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isAllowedLocalRequest } from '@/lib/api';
const handler = NextAuth(authOptions);
async function guardedHandler(req: Request, context: unknown) {
  if (!isAllowedLocalRequest(req, req.method !== 'GET')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  return handler(req, context as never);
}
export const GET = guardedHandler;
export const POST = guardedHandler;
