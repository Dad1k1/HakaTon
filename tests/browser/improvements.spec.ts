import { test, expect } from '@playwright/test';
import { credentials, client, data, baseURL } from '../helpers';
test('anonymous discussion supports live replies, editing, file paste/drop, reminders and rating', async ({
  browser,
}) => {
  const cfg = await credentials();
  const author = await client(cfg.users.employee.login, cfg.password);
  const admin = await client(cfg.users.admin.login, cfg.password);
  const created = await (
    await data(author, 'appeals', {
      title: 'Live anonymous browser ' + Date.now(),
      description: 'Discussion test',
      type: 'PROBLEM',
      categoryId: cfg.categoryId,
      priority: 'MEDIUM',
      anonymous: true,
    })
  ).json();
  const employeeContext = await browser.newContext({ storageState: await author.storageState() });
  const adminContext = await browser.newContext({ storageState: await admin.storageState() });
  const page = await employeeContext.newPage(),
    staff = await adminContext.newPage();
  for (const p of [page, staff]) {
    await p.goto(baseURL + '/?view=appeals&id=' + created.id);
    if (await p.getByRole('button', { name: 'Пропустить', exact: true }).isVisible())
      await p.getByRole('button', { name: 'Пропустить', exact: true }).click();
  }
  await expect(staff.getByText('Анонимный сотрудник', { exact: true }).first()).toBeVisible();
  await expect(staff.locator('#detail-files')).toHaveCount(0);
  await page.getByLabel('Обсуждение', { exact: true }).fill('Live reply from author');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(staff.getByText('Live reply from author', { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole('button', { name: 'Изменить сообщение', exact: true }).click();
  await page.getByLabel('Изменить сообщение', { exact: true }).fill('Edited live reply');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(staff.getByText('Edited live reply', { exact: true })).toBeVisible({
    timeout: 15000,
  });
  // Exercise the same clipboard files event used by Ctrl+V; payload is a valid PNG.
  await page.locator('#comment').evaluate((el) => {
    const bytes = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0V8AAAAASUVORK5CYII=',
      ),
      (c) => c.charCodeAt(0),
    );
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'paste.png', { type: 'image/png' }));
    el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: transfer }));
  });
  await expect(page.getByRole('img', { name: 'paste.png', exact: true })).toBeVisible();
  await expect(staff.getByRole('img', { name: 'paste.png', exact: true })).toBeVisible({
    timeout: 15000,
  });
  expect(
    await page
      .getByRole('img', { name: 'paste.png', exact: true })
      .evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBeGreaterThan(0);
  await staff.locator('#comment').evaluate((el) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['Dropped file'], 'drop.txt', { type: 'text/plain' }));
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
  });
  await expect(staff.getByRole('link', { name: /drop.txt/ }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Установить напоминание', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Напоминание установлено');
  await staff.getByLabel('Статус', { exact: true }).selectOption('REVIEW');
  await staff
    .getByLabel('Комментарий / причина / выполненные действия', { exact: true })
    .fill('Response for author');
  await staff.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ответ вас устроил?' })).toBeVisible({
    timeout: 15000,
  });
  await page.locator('#completion-reason').fill('Thank you, resolved');
  await page.getByRole('button', { name: 'Закрыть и оценить обращение' }).click();
  await expect(page.getByText('Оценка ответа: 5 / 5', { exact: true })).toBeVisible();
  await employeeContext.close();
  await adminContext.close();
  await author.dispose();
  await admin.dispose();
});

test('new request popup and guide dismissal persist', async ({ page }) => {
  const cfg = await credentials(),
    admin = await client(cfg.users.admin.login, cfg.password),
    author = await client(cfg.users.employee.login, cfg.password);
  await data(admin, 'profile', { guideDismissed: false });
  await page.context().addCookies((await admin.storageState()).cookies);
  await page.goto('/');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Больше не показывать', { exact: true }).check();
  await page.getByRole('button', { name: 'Пропустить', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Всё начинается с диалога' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const title = 'Popup request ' + Date.now();
  await data(author, 'appeals', {
    title,
    description: 'Notification test',
    type: 'PROBLEM',
    categoryId: cfg.categoryId,
    priority: 'MEDIUM',
  });
  await expect(page.getByRole('status').filter({ hasText: title })).toBeVisible({ timeout: 15000 });
  await admin.dispose();
  await author.dispose();
});

test('administrator edits, deletes and restores a user through existing settings', async ({
  page,
}) => {
  const cfg = await credentials(),
    admin = await client(cfg.users.admin.login, cfg.password);
  await page.context().addCookies((await admin.storageState()).cookies);
  await page.goto('/?view=settings');
  await page.getByRole('button', { name: 'Администрирование', exact: true }).click();
  const row = page.locator('.panel.divide-y > div').filter({ hasText: 'qa.other' });
  await row.getByRole('button', { name: 'Изменить пользователя', exact: true }).click();
  await page.locator('#admin-role').selectOption('RESPONSIBLE');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(row).toContainText('Ответственный');
  page.once('dialog', (d) => d.accept());
  await row.getByRole('button', { name: 'Удалить пользователя', exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.getByLabel('Показать удалённых', { exact: true }).check();
  await expect(row).toContainText('Удалён');
  await row.getByRole('button', { name: 'Восстановить пользователя', exact: true }).click();
  await expect(
    row.getByRole('button', { name: 'Изменить пользователя', exact: true }),
  ).toBeEnabled();
  await data(admin, 'admin/users/' + cfg.users.other.id, { role: 'EMPLOYEE' });
  await admin.dispose();
});
