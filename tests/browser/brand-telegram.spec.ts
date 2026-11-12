import { test, expect } from '@playwright/test';
import { credentials, client, data } from '../helpers';
test('branded overview, integrated appeal facts and Telegram connection screen', async ({
  page,
}) => {
  const cfg = await credentials(),
    api = await client(cfg.users.employee.login, cfg.password);
  await data(api, 'profile', { guideDismissed: true, theme: 'light', locale: 'ru' });
  await page.context().addCookies((await api.storageState()).cookies);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Добро пожаловать, QA', exact: true }),
  ).toBeVisible();
  await expect(page.locator('main')).not.toContainText('Последние изменения');
  await expect(page.locator('main')).not.toContainText('Обратная связь сотрудников');
  await expect(page.locator('.sidebar .brand-light')).toBeVisible();
  expect(
    await page
      .locator('.sidebar .brand-light')
      .evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Тёмная', exact: true }).click();
  await expect(page.locator('.sidebar .brand-dark')).toBeVisible();
  await page.screenshot({ path: '.local/overview-logo-dark.png', fullPage: true });
  const a = await (
    await data(api, 'appeals', {
      title: 'Согласование условий поставки',
      description: 'Необходимо уточнить сроки поставки по текущему проекту.',
      type: 'PROBLEM',
      categoryId: cfg.categoryId,
      priority: 'MEDIUM',
    })
  ).json();
  await page.goto('/?view=appeals&id=' + a.id);
  await expect(page.locator('.appeal-summary .appeal-facts')).toContainText('Подразделение');
  await expect(page.locator('.appeal-facts')).not.toContainText('Дата создания');
  await expect(page.locator('.appeal-summary-copy')).toContainText('Необходимо уточнить сроки');
  await page.screenshot({ path: '.local/appeal-integrated-facts.png', fullPage: true });
  await page.goto('/?view=settings');
  await expect(page.locator('.telegram-settings')).toBeVisible();
  // Verify UI states without involving a live Telegram account.
  await page.route('**/api/data/telegram', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { enabled: true, connected: false } })
      : route.fulfill({ json: { url: 'https://t.me/test_bot?start=' + 'a'.repeat(48) } }),
  );
  await page.reload();
  await page.getByRole('button', { name: 'Подключить Telegram', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Открыть бота', exact: true })).toHaveAttribute(
    'href',
    /^https:\/\/t.me\//,
  );
  await expect(page.locator('.telegram-settings')).toContainText('10 минут');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await api.dispose();
});
