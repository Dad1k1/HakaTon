import NextAuth from 'next-auth';
import { NextRequest } from 'next/server';
import { authOptions } from '@/lib/auth';
import { isAllowedLocalRequest } from '@/lib/api';
import { readLimitedBody, BodyLimitError, BodyTimeoutError } from '@/lib/security';
const handler = NextAuth(authOptions);
async function guardedHandler(req: Request, context: unknown) {
  if (!isAllowedLocalRequest(req, req.method !== 'GET')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  if (req.method === 'POST') {
    try {
      const body = await readLimitedBody(req, 16384);
      const headers = new Headers(req.headers);
      headers.delete('content-length');
      req = new NextRequest(req.url, { method: req.method, body, headers });
    } catch (e) {
      if (e instanceof BodyTimeoutError)
        return Response.json({ error: 'requestTimeout' }, { status: 408 });
      if (e instanceof BodyLimitError)
        return Response.json({ error: 'validation' }, { status: 413 });
      throw e;
    }
  }
  return handler(req, context as never);
}
export const GET = guardedHandler;
export const POST = guardedHandler;
