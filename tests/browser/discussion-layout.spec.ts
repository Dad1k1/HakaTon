import { test, expect } from '@playwright/test';
import { credentials, client, data } from '../helpers';
test('profile avatar persists and is masked for anonymous authors; attachments preview outside chat', async ({
  page,
}) => {
  const cfg = await credentials();
  const employee = await client(cfg.users.employee.login, cfg.password);
  const staff = await client(cfg.users.admin.login, cfg.password);
  await data(employee, 'profile', { guideDismissed: true, locale: 'ru', theme: 'light' });
  await page.context().addCookies((await employee.storageState()).cookies);
  await page.goto('/?view=settings');
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0V8AAAAASUVORK5CYII=',
    'base64',
  );
  await page
    .getByLabel('Загрузить аватар', { exact: true })
    .setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: bytes });
  await expect(page.getByRole('button', { name: 'Удалить аватар', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.avatar-upload img')).toBeVisible();
  const avatar = (await (await data(employee, 'me')).json()).avatar;
  expect(avatar).toMatch(/^data:image\/jpeg;base64,/);
  for (const anonymous of [false, true]) {
    let a = await (
      await data(employee, 'appeals', {
        title: 'Discussion layout ' + Date.now(),
        description: 'Unified description content',
        type: 'PROBLEM',
        categoryId: cfg.categoryId,
        priority: 'MEDIUM',
        anonymous,
      })
    ).json();
    await data(employee, `appeals/${a.id}/comments`, { version: a.version, body: 'My message' });
    a = await (await data(employee, `appeals/${a.id}`)).json();
    await data(staff, `appeals/${a.id}/comments`, { version: a.version, body: 'Staff reply' });
    const otherView = await (await data(staff, `appeals/${a.id}`)).json();
    expect(otherView.author.avatar).toBe(anonymous ? undefined : avatar);
    expect(
      otherView.comments.find((c: { body: string }) => c.body === 'My message').author.avatar,
    ).toBe(anonymous ? undefined : avatar);
    await page.goto('/?view=appeals&id=' + a.id);
    await expect(page.locator('.appeal-summary')).toContainText('Unified description content');
    await expect(page.getByRole('heading', { name: 'Вложения', exact: true })).toHaveCount(0);
    await expect(page.locator('#reminder-interval')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'История изменений', exact: true })).toHaveCount(
      0,
    );
    await expect(page.locator('.discussion-message.own')).toContainText('My message');
    await expect(page.locator('.discussion-message:not(.own)')).toContainText('Staff reply');
    await expect(
      page.getByRole('button', { name: 'Изменить сообщение', exact: true }),
    ).toBeVisible();
    expect(
      await page.getByRole('button', { name: 'Изменить сообщение', exact: true }).innerText(),
    ).toBe('');
    a = await (await data(employee, `appeals/${a.id}`)).json();
    const upload = await employee.post(`/api/data/appeals/${a.id}/files`, {
      multipart: {
        version: String(a.version),
        files: { name: 'screen.png', mimeType: 'image/png', buffer: bytes },
      },
    });
    expect(upload.ok()).toBe(true);
    await page.reload();
    await expect(page.locator('.attachment-gallery img')).toBeVisible();
    await expect(page.locator('.discussion-message img[alt="screen.png"]')).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Открыть изображение: screen.png', exact: true })
      .click();
    await expect(page.getByRole('dialog', { name: 'screen.png', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'screen.png', exact: true })).toHaveCount(0);
    await expect(page.locator('.attachment-gallery a')).toHaveCount(0);
    if (!anonymous) {
      await page.screenshot({ path: '.local/discussion-updated.png', fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
      await page.screenshot({ path: '.local/discussion-mobile.png', fullPage: true });
      await page.setViewportSize({ width: 1280, height: 720 });
    }
  }
  const invalid = await data(employee, 'profile', {
    avatar: 'data:image/jpeg;base64,PHN2Zz48L3N2Zz4=',
  });
  expect(invalid.status()).toBe(400);
  await data(employee, 'profile', { avatar: null });
  await employee.dispose();
  await staff.dispose();
});
