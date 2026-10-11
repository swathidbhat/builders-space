import { expect, test } from '@playwright/test';

test('dashboard renders live fixture sessions', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Builders Space' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Lumen Lab/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('1 planet discovered')).toBeVisible();

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);

  await page.getByRole('button', { name: /Lumen Lab/ }).click();
  await expect(page.getByText('Claude').first()).toBeVisible();
  await expect(page.getByText('Cursor').first()).toBeVisible();
  await expect(page.getByText('Codex').first()).toBeVisible();
  await page.getByText('Raw', { exact: true }).click();
  await expect(page.getByText('Read:App.tsx')).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});
