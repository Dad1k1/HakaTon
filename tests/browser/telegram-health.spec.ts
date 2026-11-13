import { test, expect } from '@playwright/test';
import { credentials, client, data } from '../helpers';
test('Telegram shows worker failures, a complete binding command and delivery testing', async ({
  page,
}) => {
  const cfg = await credentials(),
    api = await client(cfg.users.employee.login, cfg.password);
  await data(api, 'profile', { locale: 'ru', guideDismissed: true });
  await page.context().addCookies((await api.storageState()).cookies);
  let status = {
    enabled: true,
    connected: false,
    worker: { running: false, ready: false, errorCode: 0 },
  };
  const actions: string[] = [];
  await page.route('**/api/data/telegram', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: status });
    const { action } = route.request().postDataJSON();
    actions.push(action);
    return route.fulfill({
      json:
        action === 'connect'
          ? { url: 'https://t.me/test_bot?start=' + 'b'.repeat(48) }
          : { ok: true },
    });
  });
  await page.goto('/?view=settings');
  const section = page.locator('.telegram-settings');
  await expect(section).toContainText('Сервис Telegram не запущен');
  await expect(
    section.getByRole('button', { name: 'Подключить Telegram', exact: true }),
  ).toBeDisabled();
  status = { ...status, worker: { running: true, ready: true, errorCode: 0 } };
  await page.reload();
  await section.getByRole('button', { name: 'Подключить Telegram', exact: true }).click();
  await expect(page.locator('#telegram-start-command')).toHaveValue('/start ' + 'b'.repeat(48));
  await expect(section).toContainText('без кода не привязывает профиль');
  status = { ...status, connected: true };
  await page.reload();
  await section.getByRole('button', { name: 'Проверить доставку', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Проверочное уведомление отправлено' }),
  ).toBeVisible();
  expect(actions).toEqual(['connect', 'test']);
  status = {
    enabled: true,
    connected: false,
    worker: { running: true, ready: false, errorCode: 401 },
  };
  await page.reload();
  await expect(section).toContainText('Telegram отклонил токен');
  status.worker.errorCode = 409;
  await page.reload();
  await expect(section).toContainText('другим процессом или webhook');
  await api.dispose();
});
