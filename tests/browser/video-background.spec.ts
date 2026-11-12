import { test, expect } from '@playwright/test';

test('paused camera video scrubs in both directions without overlapping seeks', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const video = page.locator('.camera-video-background');
  await expect
    .poll(() =>
      video.evaluate(
        (v: HTMLVideoElement) => v.readyState >= 2 && !v.seeking && v.currentTime > 0.1,
      ),
    )
    .toBe(true);
  expect(
    await video.evaluate(
      (v: HTMLVideoElement) => v.paused && v.muted && v.playsInline && !v.autoplay,
    ),
  ).toBe(true);
  await expect(video).toHaveAttribute('preload', 'auto');
  await expect(video).toHaveCSS('position', 'fixed');
  await expect(video).toHaveCSS('object-fit', 'cover');
  const start = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  await page.mouse.move(100, 90);
  await page.mouse.move(400, 90);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(start + 0.5);
  await page.mouse.move(100, 90);
  await expect
    .poll(() =>
      video.evaluate(
        (v: HTMLVideoElement, initial: number) => Math.abs(v.currentTime - initial),
        start,
      ),
    )
    .toBeLessThan(0.03);
  await video.evaluate((v) => {
    let depth = 0,
      max = 0;
    v.addEventListener('seeking', () => {
      depth++;
      max = Math.max(max, depth);
      v.dataset.maxDepth = String(max);
    });
    v.addEventListener('seeked', () => {
      depth = Math.max(0, depth - 1);
    });
    for (let i = 0; i < 100; i++)
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: i % 2 ? innerWidth : 0 }));
  });
  await expect
    .poll(() =>
      video.evaluate(
        (v: HTMLVideoElement) => !v.seeking && Math.abs(v.currentTime - v.duration) < 0.03,
      ),
    )
    .toBe(true);
  expect(Number(await video.getAttribute('data-max-depth'))).toBeLessThanOrEqual(1);
  const card = await page.locator('.login-card').boundingBox();
  expect(Math.abs(card!.x + card!.width / 2 - 720)).toBeLessThan(8);
  await page.getByLabel('Логин', { exact: true }).fill('demo.user');
  await page.screenshot({
    path: '.local/login-video-light.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Тёмная', exact: true }).click();
  await page.screenshot({
    path: '.local/login-video-dark.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const stopped = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  await page.mouse.move(700, 100);
  await page.mouse.move(100, 100);
  expect(await video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(stopped);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: '.local/login-video-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.route('**/camera-turn.mp4', (route) => route.abort());
  await page.reload();
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible();
  await expect(video).toHaveAttribute('poster', '/camera-turn-poster.jpg');
});
