import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

function transportNoise(message: string): boolean {
  return /WebSocket|socket\.io|ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|closed before the connection is established/i.test(
    message,
  );
}

function lumenLab(page: Page) {
  return page
    .getByRole('region', { name: 'All projects' })
    .getByRole('button', { name: /Lumen Lab/ });
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
  await expect(lumenLab(page)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('10 planets discovered')).toBeVisible();

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);

  const needsYou = page.getByRole('region', { name: 'Needs you' });
  await expect(needsYou).toBeVisible();
  await expect(needsYou).toContainText('TypeError: Cannot read properties of undefined');
  await expect(needsYou).toContainText('verify the stripe webhook signature');

  const label = page.locator('[data-planet-label]:visible').first();
  await expect(label).toBeVisible();
  const readable = await label.evaluate((el) => {
    const name = el.querySelector('[data-planet-name]');
    const rect = (name ?? el).getBoundingClientRect();
    const font = parseFloat(getComputedStyle(name ?? el).fontSize);
    const unscaled = name instanceof HTMLElement ? name.offsetHeight : el.offsetHeight;
    const effective = unscaled > 0 ? font * (rect.height / unscaled) : rect.height;
    return { box: rect.height, effective };
  });
  expect(readable.box).toBeGreaterThanOrEqual(12);
  expect(readable.effective).toBeGreaterThanOrEqual(12);

  await lumenLab(page).click();
  await expect(page.getByText('Claude').first()).toBeVisible();
  await expect(page.getByText('Cursor').first()).toBeVisible();
  await expect(page.getByText('Codex').first()).toBeVisible();
  await expect(page.getByText('Read:App.tsx')).toBeVisible();
  await expect(page.getByText(/TypeError: Cannot read properties of undefined/)).toHaveCount(2);
  expect(errors, errors.join('\n')).toEqual([]);

  const shots = process.env.BS_SHOTS;
  if (shots) {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${shots}/after-selected-1920.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${shots}/after-sky-1920.png` });
    await page.screenshot({
      path: `${shots}/after-sidebar.png`,
      clip: { x: 0, y: 0, width: 280, height: 640 },
    });
  }
});

test('shows a disconnected sky and recovers after the API restarts', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await expect(lumenLab(page)).toBeVisible({ timeout: 20_000 });

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
  await expect(lumenLab(page)).toBeVisible();

  const restarted = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: { ...process.env, HOME: runtime.home },
    stdio: 'inherit',
  });
  try {
    await expect(
      page.getByRole('status').filter({ hasText: 'Disconnected — retrying' }),
    ).toHaveCount(0, { timeout: 30_000 });
    await expect(lumenLab(page)).toBeVisible();
    await expect(page.getByText('10 planets discovered', { exact: true })).toBeVisible();
  } finally {
    if (restarted.pid) {
      writeFileSync(
        'e2e/.runtime.json',
        JSON.stringify({ home: runtime.home, pid: restarted.pid }),
      );
    }
  }

  const unexpected = errors.filter((message) => !transportNoise(message));
  expect(unexpected, unexpected.join('\n')).toEqual([]);
});
