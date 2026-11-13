import { test, expect } from '@playwright/test';
import { credentials, client, data } from '../helpers';
test('nonce CSP permits the application and blocks injected inline scripts', async ({ page }) => {
  await page.route('**/', async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace(
      '</head>',
      "<script>document.documentElement.dataset.pwned='yes'</script></head>",
    );
    await route.fulfill({ response, body: html });
  });
  const response = await page.goto('/');
  const csp = response!.headers()['content-security-policy'];
  expect(csp).toContain("'strict-dynamic'");
  expect(csp.split(';').find((s) => s.includes('script-src'))).not.toContain('unsafe-inline');
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible();
  expect(await page.locator('html').getAttribute('data-pwned')).toBeNull();
  const cfg = await credentials();
  await page.getByLabel('Логин', { exact: true }).fill(cfg.users.employee.login);
  await page.getByLabel('Пароль', { exact: true }).fill(cfg.password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Добро пожаловать,/ })).toBeVisible();
});
test('authentication rejects oversized bodies and anonymous histories hide assignment identifiers', async () => {
  const cfg = await credentials(),
    admin = await client(cfg.users.admin.login, cfg.password),
    author = await client(cfg.users.manager.login, cfg.password);
  try {
    expect(
      (
        await admin.post('/api/auth/callback/credentials', {
          data: 'x'.repeat(20000),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      ).status(),
    ).toBe(413);
    const first = await admin.get('/'),
      second = await admin.get('/');
    expect(first.headers()['content-security-policy']).not.toBe(
      second.headers()['content-security-policy'],
    );
    const a = await (
      await data(author, 'appeals', {
        title: 'Security anonymous assignment',
        description: 'Test',
        type: 'PROBLEM',
        priority: 'MEDIUM',
        categoryId: cfg.categoryId,
        anonymous: true,
      })
    ).json();
    expect(
      (
        await data(admin, `appeals/${a.id}`, {
          version: a.version,
          assigneeId: cfg.users.manager.id,
        })
      ).ok(),
    ).toBe(true);
    const card = await (await data(admin, `appeals/${a.id}`)).json();
    expect(JSON.stringify(card.history)).not.toContain(cfg.users.manager.id);
  } finally {
    await admin.dispose();
    await author.dispose();
  }
});
