import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { expect, test } from '@playwright/test';

function transportNoise(message: string): boolean {
  return /WebSocket|socket\.io|ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|closed before the connection is established/i.test(
    message,
  );
}

function waitUntilGone(pid: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      try {
        process.kill(pid, 0);
      } catch {
        clearInterval(timer);
        resolve();
      }
    }, 50);
  });
}

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

test('shows a disconnected sky and recovers after the API restarts', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await expect(page.getByRole('button', { name: /Lumen Lab/ })).toBeVisible({ timeout: 20_000 });

  const runtime = JSON.parse(readFileSync('e2e/.runtime.json', 'utf8')) as {
    home: string;
    pid: number;
  };
  process.kill(runtime.pid, 'SIGTERM');
  await waitUntilGone(runtime.pid);

  await expect(page.getByRole('status').filter({ hasText: 'Disconnected — retrying' })).toBeVisible(
    {
      timeout: 15_000,
    },
  );
  await expect(page.getByText(/last update is stale/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Lumen Lab/ })).toBeVisible();

  const restarted = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: { ...process.env, HOME: runtime.home },
    stdio: 'inherit',
  });
  try {
    await expect(
      page.getByRole('status').filter({ hasText: 'Disconnected — retrying' }),
    ).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Lumen Lab/ })).toBeVisible();
    await expect(page.getByText('1 planet discovered', { exact: true })).toBeVisible();
  } finally {
    restarted.kill('SIGTERM');
  }

  const unexpected = errors.filter((message) => !transportNoise(message));
  expect(unexpected, unexpected.join('\n')).toEqual([]);
});
