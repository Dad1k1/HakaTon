import { request, type APIRequestContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
export const baseURL = process.env.TEST_BASE_URL || 'http://localhost:3000';
export async function credentials() {
  return JSON.parse(await readFile('.local/test-credentials.json', 'utf8')) as {
    password: string;
    users: Record<string, { id: string; login: string }>;
    categoryId: string;
    departmentId: string;
    otherDepartmentId: string;
  };
}
export async function client(login: string, password: string) {
  const c = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  const csrf = await (await c.get('/api/auth/csrf')).json();
  await c.post('/api/auth/callback/credentials', {
    form: { csrfToken: csrf.csrfToken, login, password, json: 'true', callbackUrl: baseURL },
  });
  return c;
}
export const data = (c: APIRequestContext, p: string, body?: unknown) =>
  body === undefined ? c.get('/api/data/' + p) : c.post('/api/data/' + p, { data: body });
