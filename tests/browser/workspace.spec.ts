import { test, expect, type Page } from '@playwright/test';
import { credentials } from '../helpers';
async function login(page: Page, role = 'employee') {
  const c = await credentials();
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(c.users[role].login);
  await page.getByLabel('Пароль', { exact: true }).fill(c.password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Всё начинается с диалога' })).toBeVisible();
  if (await page.getByRole('button', { name: 'Пропустить', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Пропустить', exact: true }).click();
}
test('generic login error and unauthenticated API denial', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('unknown.login');
  await page.getByLabel('Пароль', { exact: true }).fill('incorrect');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Неверный логин или пароль' }),
  ).toContainText('Неверный логин или пароль');
  expect((await page.request.get('/api/data/appeals')).status()).toBe(401);
});
for (const role of ['employee', 'responsible', 'manager', 'admin'])
  test('login and navigation for ' + role, async ({ page }) => {
    await login(page, role);
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'Обращения', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Обращения', exact: true })).toBeVisible();
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'Аналитика', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Аналитика', exact: true })).toBeVisible();
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'Настройки', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Профиль', exact: true })).toBeVisible();
    if (role === 'admin') {
      await page.getByRole('button', { name: 'Администрирование', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Администрирование' })).toBeVisible();
    } else await expect(page.getByRole('heading', { name: 'Администрирование' })).not.toBeVisible();
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible();
  });
test('creates appeal with file, adds comment, persists filter URL', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Создать обращение', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Категория', { exact: true })
    .selectOption((await credentials()).categoryId);
  const title = 'Browser appeal ' + Date.now();
  await dialog.getByLabel('Заголовок', { exact: true }).fill(title);
  await dialog.getByLabel('Описание', { exact: true }).fill('A complete browser submission');
  await dialog.getByLabel('Вложения', { exact: false }).setInputFiles({
    name: 'browser.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Browser attachment'),
  });
  await dialog.getByRole('button', { name: 'Отправить обращение' }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /browser.txt/ }).first()).toBeVisible();
  await page.getByLabel('Обсуждение', { exact: true }).fill('Extra information');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.getByText('Extra information', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Extra information', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /browser.txt/ }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Обращения', exact: true }).last().click();
  await page.getByRole('textbox', { name: 'Номер, заголовок или описание' }).fill(title);
  await page.getByRole('button', { name: 'Номер, заголовок или описание', exact: true }).click();
  await expect(page).toHaveURL(/q=/);
  await expect(page.getByRole('link').filter({ hasText: title })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Номер, заголовок или описание' })).toHaveValue(
    title,
  );
});
test('forces temporary password change and invalidates old session', async ({ page }) => {
  const c = await credentials();
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(c.users.temporary.login);
  await page.getByLabel('Пароль', { exact: true }).fill(c.password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByText('Установите личный пароль для продолжения работы.')).toBeVisible();
  expect((await page.request.get('/api/data/appeals')).status()).toBe(403);
  await page.getByLabel('Текущий пароль', { exact: true }).fill(c.password);
  await page.getByLabel('Новый пароль', { exact: true }).fill(c.password + 'changed');
  await page.getByRole('button', { name: 'Смена пароля', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible();
});
for (const locale of ['ru', 'kk', 'en'])
  for (const theme of ['light', 'dark'])
    test(`visual ${locale} ${theme}: desktop and mobile`, async ({ page }, testInfo) => {
      await login(page);
      const label = { ru: 'Язык', kk: 'Тіл', en: 'Language' };
      await page.getByRole('combobox', { name: 'Язык', exact: true }).selectOption(locale);
      if (theme === 'dark')
        await page
          .getByRole('button', {
            name: { ru: 'Тёмная', kk: 'Қараңғы', en: 'Dark' }[locale],
            exact: true,
          })
          .click();
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^$/);
      await page.screenshot({
        path: testInfo.outputPath(`${locale}-${theme}-desktop.png`),
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
      await page
        .getByRole('button', {
          name: { ru: 'Открыть меню', kk: 'Мәзірді ашу', en: 'Open menu' }[locale],
          exact: true,
        })
        .click();
      await page
        .getByRole('navigation')
        .getByRole('button', {
          name: { ru: 'Обращения', kk: 'Өтініштер', en: 'Appeals' }[locale],
          exact: true,
        })
        .click();
      await expect(page.locator('.mobile-cards')).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`${locale}-${theme}-mobile.png`),
        fullPage: true,
      });
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^$/);
      // Restore profile preferences so each case starts in Russian/light.
      await page.request.post('/api/data/profile', {
        headers: { Origin: process.env.TEST_BASE_URL || 'http://localhost:3000' },
        data: { locale: 'ru', theme: 'light' },
      });
    });
for (const locale of ['ru', 'kk', 'en'])
  test(`language and theme before login: ${locale}`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('combobox', { name: 'Язык', exact: true }).selectOption(locale);
    await page
      .getByRole('button', {
        name: { ru: 'Тёмная', kk: 'Қараңғы', en: 'Dark' }[locale],
        exact: true,
      })
      .click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

test('responsible completes clarification flow in the browser and sees notifications', async ({
  page,
}) => {
  const { client, data } = await import('../helpers');
  const c = await credentials();
  const employee = await client(c.users.employee.login, c.password);
  const created = await (
    await data(employee, 'appeals', {
      title: 'Browser processing flow ' + Date.now(),
      description: 'Browser processing scenario',
      type: 'PROBLEM',
      priority: 'MEDIUM',
      categoryId: c.categoryId,
    })
  ).json();
  await login(page, 'responsible');
  await page.goto('/?view=appeals&id=' + created.id);
  await expect(
    page.getByRole('heading', { name: 'Рассмотрение обращения', exact: true }),
  ).toBeVisible();
  const save = async (status: string, reason?: string) => {
    await page.getByLabel('Статус', { exact: true }).selectOption(status);
    if (reason)
      await page
        .getByLabel('Комментарий / причина / выполненные действия', { exact: true })
        .fill(reason);
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/data/appeals/' + created.id) &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    expect((await saved).ok()).toBe(true);
    // The selected option changes before saving; wait for the refreshed persisted status.
    await expect(page.locator('.badge.' + status).first()).toBeVisible();
    await expect(page.getByLabel('Статус', { exact: true })).toHaveValue(status);
  };
  await save('REVIEW');
  await save('WAITING', 'Which workflow needs clarification?');
  const card = await (await data(employee, 'appeals/' + created.id)).json();
  await data(employee, 'appeals/' + created.id + '/comments', {
    version: card.version,
    body: 'Procurement workflow.',
  });
  await page.reload();
  await save('IN_PROGRESS');
  await save('IMPLEMENTED', 'Updated the procurement template.');
  await expect(page.getByRole('heading', { name: 'Итоговое решение', exact: true })).toBeVisible();
  await expect(
    page.getByText('Updated the procurement template.', { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Уведомления', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Уведомления', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Прочитать все', exact: true }).click();
  await employee.dispose();
});
