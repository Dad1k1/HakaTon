import { handle } from '@/lib/api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, context: { params: Promise<{ path: string[] }> }) {
  return handle(req, (await context.params).path);
}
export const POST = GET;
