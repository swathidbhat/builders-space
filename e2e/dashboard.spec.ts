import { expect, test } from '@playwright/test';

test('dashboard renders live fixture sessions', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Builders Space' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Lumen Lab/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('1 planet discovered')).toBeVisible();

  await page.getByRole('button', { name: /Lumen Lab/ }).click();
  await expect(page.getByText('Claude').first()).toBeVisible();
  await expect(page.getByText('Cursor').first()).toBeVisible();
  await expect(page.getByText('Codex').first()).toBeVisible();
  await page.getByText('Raw', { exact: true }).click();
  await expect(page.getByText('Read:App.tsx')).toBeVisible();
});
