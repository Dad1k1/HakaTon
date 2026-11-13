import { test, expect } from '@playwright/test';
import { credentials, client, data } from '../helpers';
import { mkdir } from 'node:fs/promises';

async function session(page: import('@playwright/test').Page, guide = false) {
  const cfg = await credentials();
  const admin = await client(cfg.users.admin.login, cfg.password);
  await data(admin, 'profile', { guideDismissed: !guide, theme: 'light', locale: 'ru' });
  await page.context().addCookies((await admin.storageState()).cookies);
  return { admin, cfg };
}

test('overview uses real chart data and ends the latest panel at its last appeal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { admin, cfg } = await session(page);
  for (const title of [
    'Уточнение требований к отчёту о продажах',
    'Ошибка доступа к базе данных CRM',
  ]) {
    await data(admin, 'appeals', {
      title,
      description: 'Описание вопроса для проверки интерфейса.',
      type: 'PROBLEM',
      categoryId: cfg.categoryId,
      priority: 'MEDIUM',
    });
  }
  const analytics = await (await data(admin, 'analytics')).json();
  await page.goto('/');
  const chart = page.getByRole('img', { name: /^За 7 дней:/ });
  const total = analytics.daily
    .slice(-7)
    .reduce((sum: number, d: { created: number }) => sum + d.created, 0);
  await expect(chart).toHaveAttribute('aria-label', new RegExp(`поступило ${total},`));
  await page.getByRole('button', { name: '30 дней', exact: true }).click();
  await expect(page.getByRole('img', { name: /^За 30 дней:/ })).toBeVisible();
  const panel = page.getByTestId('latest-appeals');
  const bounds = await panel.boundingBox();
  const last = await panel.locator('.appeal-row').last().boundingBox();
  expect(Math.abs(bounds!.y + bounds!.height - (last!.y + last!.height))).toBeLessThan(3);
  await mkdir('.local/previews', { recursive: true });
  await page.screenshot({ path: '.local/previews/overview-light.png', fullPage: true });
  await page.getByRole('button', { name: 'Тёмная', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({ path: '.local/previews/overview-dark.png', fullPage: true });
  await page.getByRole('button', { name: 'Создать обращение', exact: true }).click();
  await page.getByRole('dialog').evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((animation) => animation.finished));
  });
  const anonymous = page.getByLabel('Отправить анонимно', { exact: true });
  const cancel = page.getByRole('button', { name: 'Отмена', exact: true });
  const a = await anonymous.boundingBox(),
    c = await cancel.boundingBox();
  expect(a!.x).toBeLessThan(c!.x);
  expect(Math.abs(a!.y + a!.height / 2 - c!.y - c!.height / 2)).toBeLessThan(5);
  await expect(page.getByText(/Имя скрыто от участников/)).toHaveCount(0);
  await page.screenshot({ path: '.local/previews/new-appeal.png', fullPage: true });
  await page.keyboard.press('Escape');
  await admin.dispose();
});

test('notifications filter, mark as read, open and dismiss correctly', async ({ page }) => {
  const { admin, cfg } = await session(page);
  const author = await client(cfg.users.employee.login, cfg.password);
  await data(admin, 'notifications', {});
  const title = 'Новое сообщение для центра уведомлений ' + Date.now();
  const appeal = await (
    await data(author, 'appeals', {
      title,
      description: 'Проверка уведомлений',
      type: 'PROBLEM',
      categoryId: cfg.categoryId,
      priority: 'MEDIUM',
    })
  ).json();
  await page.goto('/');
  const bell = page.getByRole('button', { name: 'Уведомления', exact: true });
  await bell.click();
  const center = page.getByRole('dialog', { name: 'Уведомления', exact: true });
  await expect(center.getByText(title, { exact: true })).toBeVisible();
  await center.getByRole('button', { name: /Непрочитанные/ }).click();
  await expect(center.getByText(title, { exact: true })).toBeVisible();
  await mkdir('.local/previews', { recursive: true });
  await page.screenshot({ path: '.local/previews/notifications.png', fullPage: true });
  await center.getByRole('button', { name: 'Прочитать все', exact: true }).click();
  await expect(center.getByText('Всё прочитано', { exact: true })).toBeVisible();
  await center.getByRole('button', { name: 'Все', exact: true }).click();
  await center
    .locator('article')
    .filter({ hasText: title })
    .getByRole('button', { name: /^Перейти/ })
    .click();
  await expect(page).toHaveURL(new RegExp(appeal.id));
  await expect(center).toHaveCount(0);
  await bell.click();
  await page.keyboard.press('Escape');
  await expect(center).toHaveCount(0);
  await expect(bell).toBeFocused();
  await bell.click();
  await page.locator('header').click({ position: { x: 10, y: 10 } });
  await expect(center).toHaveCount(0);
  await author.dispose();
  await admin.dispose();
});

for (const mobile of [false, true]) {
  test(`guided tour follows actual controls without sending an appeal (${mobile ? 'mobile' : 'desktop'})`, async ({
    page,
  }) => {
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    const { admin } = await session(page, true);
    const before = await (await data(admin, 'appeals')).json();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Начнём с обращений' })).toBeVisible();
    await page.locator('[data-tour="nav-appeals"]').click();
    await expect(page.getByRole('heading', { name: 'Поделитесь своим вопросом' })).toBeVisible();
    await page.locator('[data-tour="create"]').click();
    await expect(page.getByRole('heading', { name: 'Самое главное — суть' })).toBeVisible();
    await page.locator('.tour-tip').getByRole('button', { name: 'Далее', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Вы решаете, как отправить' })).toBeVisible();
    await page.getByLabel('Отправить анонимно', { exact: true }).check();
    await page.locator('.tour-tip').getByRole('button', { name: 'Далее', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Готово, вы освоились!' })).toBeVisible();
    await page.getByLabel('Больше не показывать', { exact: true }).check();
    await mkdir('.local/previews', { recursive: true });
    await page.screenshot({
      path: `.local/previews/tour-${mobile ? 'mobile' : 'desktop'}.png`,
      fullPage: true,
    });
    await page.locator('[data-tour="submit"]').focus();
    await page.keyboard.press('Tab');
    await expect(
      page.locator('.tour-tip').getByRole('button', { name: 'Закрыть', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('[data-tour="submit"]')).toBeFocused();
    // A background notifications refresh must not steal focus from the guide.
    await page.waitForResponse(
      (response) => response.url().endsWith('/api/data/notifications') && response.ok(),
    );
    await expect(page.locator('[data-tour="submit"]')).toBeFocused();
    await page.locator('[data-tour="submit"]').click();
    await expect(page.locator('.tour-layer')).toHaveCount(0);
    const after = await (await data(admin, 'appeals')).json();
    expect(after.total).toBe(before.total);
    await expect(
      page.getByRole('dialog', { name: 'Создать обращение', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.locator('.tour-layer')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    if (mobile) await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
    await page.getByRole('button', { name: 'Как пользоваться', exact: true }).click();
    await expect(page.locator('.tour-layer')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.tour-layer')).toHaveCount(0);
    await admin.dispose();
  });
}

test('mobile layouts remain within the screen in both themes and all locales', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { admin } = await session(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const locale of ['ru', 'en', 'kk']) {
    await page.locator('header select').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('.trend-chart')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.locator('header select').selectOption('ru');
  await page.getByRole('button', { name: 'Тёмная', exact: true }).click();
  await page.screenshot({ path: '.local/previews/mobile-dark.png', fullPage: true });
  await page.getByRole('button', { name: 'Уведомления', exact: true }).click();
  await expect(page.locator('.notification-center')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await admin.dispose();
});
