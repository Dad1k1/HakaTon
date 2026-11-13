import { test, expect } from '@playwright/test';
test.skip(process.env.MOBILE_SECURITY !== '1', 'Standalone mobile preview only');
test('migrates plaintext credentials, rejects profile privilege changes and keeps secrets out of API responses', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByLabel('Логин', { exact: true })).toBeVisible({ timeout: 60000 });
  await page.getByLabel('Логин', { exact: true }).fill('admin');
  await page.getByLabel('Пароль', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Добро пожаловать,/ })).toBeVisible();
  const result = await page.evaluate(async () => {
    const profile = await fetch('/api/data/profile', {
      method: 'POST',
      body: JSON.stringify({ name: 'Changed', role: 'EMPLOYEE' }),
    });
    const me = await (await fetch('/api/data/me')).json();
    const config = await (await fetch('/api/data/admin/config')).json();
    const open = indexedDB.open('modus-demo', 1);
    const db = await new Promise<IDBDatabase>((resolve) => {
      open.onsuccess = () => resolve(open.result);
    });
    const transaction = db.transaction('state', 'readwrite');
    const store = transaction.objectStore('state');
    const r = store.get('data');
    const state: any = await new Promise((resolve) => {
      r.onsuccess = () => resolve(r.result);
    });
    const plaintext = state.users.some((u: any) => 'password' in u);
    const hashed = state.users.every((u: any) => /^pbkdf2\$/.test(u.passwordHash));
    // Simulate a previous-version database for the next reload.
    const admin = state.users.find((u: any) => u.login === 'admin');
    delete admin.passwordHash;
    admin.password = 'admin';
    state.session = null;
    store.put(state, 'data');
    await new Promise<void>((resolve) => {
      transaction.oncomplete = () => resolve();
    });
    db.close();
    return {
      status: profile.status,
      role: me.role,
      config: JSON.stringify(config),
      plaintext,
      hashed,
    };
  });
  expect(result).toMatchObject({ status: 400, role: 'ADMIN', plaintext: false, hashed: true });
  expect(result.config).not.toContain('password');
  await page.reload();
  await expect(page.getByLabel('Логин', { exact: true })).toBeVisible({ timeout: 60000 });
  await page.getByLabel('Логин', { exact: true }).fill('admin');
  await page.getByLabel('Пароль', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Добро пожаловать,/ })).toBeVisible();
});
