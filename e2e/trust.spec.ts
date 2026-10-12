import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { assertSkyPainted } from './paintedSky';

const ARTIFACTS = '/opt/cursor/artifacts/trust';
const QUESTION =
  'The old charge path still has callers in checkout, including the receipt mailer and the nightly reconciliation job. Should I delete it anyway, or keep it behind a flag until those callers move?';
const CURSOR_JSONL_QUESTION =
  'From the Cursor transcript: should the receipt mailer stay on the old charge path?';
const CURSOR_TXT_QUESTION = 'From the Cursor notes: keep the flag until checkout moves?';
const CODEX_QUESTION = 'From Codex: delete the legacy charge path, or leave the flag?';

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 800 },
  { width: 800, height: 900 },
] as const;

function save(page: Page, name: string) {
  mkdirSync(ARTIFACTS, { recursive: true });
  return page.screenshot({ path: `${ARTIFACTS}/${name}` });
}

test('a waiting project shows the question, not the task or the last command', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const billing = page.getByRole('navigation', { name: 'Projects' }).getByRole('button', {
    name: /Billing Question Backfill/,
  });
  await expect(billing).toBeVisible({ timeout: 20_000 });
  await expect(billing).toContainText(QUESTION);
  await expect(billing).toContainText(/quiet for \d+ min/);
  await expect(billing).not.toContainText('migrate the payments dashboard');
  await expect(billing).not.toContainText('psql');
  const reason = billing.locator('[data-project-reason]');
  await expect(reason).toHaveAttribute('data-expanded', 'false');
  const clamped = await reason.evaluate((el) => getComputedStyle(el).webkitLineClamp);
  expect(clamped).toBe('3');

  await page
    .getByRole('navigation', { name: 'Projects' })
    .getByRole('button', { name: 'Show more' })
    .click();
  await expect(reason).toHaveAttribute('data-expanded', 'true');
  expect(await reason.evaluate((el) => getComputedStyle(el).webkitLineClamp)).toBe('none');

  await billing.click();
  const panel = page.getByRole('complementary', { name: 'Project details' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(QUESTION)).toHaveCount(1);
  await expect(panel.getByText(CURSOR_JSONL_QUESTION)).toHaveCount(1);
  await expect(panel.getByText(CURSOR_TXT_QUESTION)).toHaveCount(1);
  await expect(panel.getByText(CODEX_QUESTION)).toHaveCount(1);
  await expect(panel.getByText('psql')).toHaveCount(0);
  await assertSkyPainted(page);
  await expect(
    page.getByRole('navigation', { name: 'Projects' }).getByText('Old Blog'),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Projects' }).getByRole('button', { name: /Old Blog/ }),
  ).toContainText('Should I delete the drafts, or keep them?');
  await save(page, 'waiting-question-1280x800.png');
});

test('disable confirmation buttons stay on screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.getByText('10 planets discovered')).toBeVisible({ timeout: 20_000 });
  const settings = page.getByRole('button', { name: /Settings/ });
  await settings.click();
  await page.getByRole('button', { name: 'Enable Hooks' }).click();
  await expect(page.getByRole('button', { name: 'Disable' })).toBeVisible({ timeout: 20_000 });

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.getByRole('button', { name: 'Disable' }).click();
    const cancel = page.getByRole('button', { name: 'Cancel' });
    const remove = page.getByRole('button', { name: 'Remove hooks' });
    await expect(cancel).toBeVisible();
    await expect(remove).toBeVisible();
    const boxes = await page.evaluate(() => {
      function box(name: string) {
        const button = [...document.querySelectorAll('button')].find(
          (el) => el.textContent?.trim() === name,
        );
        if (!button) return null;
        const rect = button.getBoundingClientRect();
        const popover = button.closest('#sky-settings');
        const pop = popover?.getBoundingClientRect();
        return {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          popTop: pop?.top ?? -1,
          popBottom: pop?.bottom ?? -1,
        };
      }
      return {
        cancel: box('Cancel'),
        remove: box('Remove hooks'),
        height: window.innerHeight,
        width: window.innerWidth,
      };
    });
    expect(boxes.cancel).not.toBeNull();
    expect(boxes.remove).not.toBeNull();
    for (const button of [boxes.cancel, boxes.remove]) {
      if (!button) continue;
      expect(button.top).toBeGreaterThanOrEqual(0);
      expect(button.left).toBeGreaterThanOrEqual(0);
      expect(button.bottom).toBeLessThanOrEqual(boxes.height);
      expect(button.right).toBeLessThanOrEqual(boxes.width);
      expect(button.top).toBeGreaterThanOrEqual(button.popTop - 1);
      expect(button.bottom).toBeLessThanOrEqual(button.popBottom + 1);
    }
    await page.getByRole('button', { name: 'Cancel' }).click();
  }
});

test('a disconnected sky stops the counters and stamps the last update', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.getByText('10 planets discovered')).toBeVisible({ timeout: 20_000 });
  const pulsing = page.locator('[data-counters]').locator('[class*="pulse"]');
  await expect(pulsing.first()).toBeVisible();

  await page.evaluate(() => {
    const store = window.__spaceStore;
    if (!store) throw new Error('space store is not available');
    store.setState({ connection: 'stale', dataStale: true });
  });

  await expect(page.getByText(/Disconnected — retrying\. Statuses as of /)).toBeVisible();
  await expect(page.getByText(/last update is stale, as of /)).toBeVisible();
  await expect(page.getByText('last activity just now')).toHaveCount(0);
  await expect(pulsing).toHaveCount(0);
  await expect(page.getByText('10 planets discovered').locator('xpath=..')).toContainText(/as of /);
  await assertSkyPainted(page);
  await save(page, 'disconnected-1280x800.png');
});

test('the sky leaves loading and paints the planets', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.getByText('10 planets discovered')).toBeVisible({ timeout: 20_000 });
  await assertSkyPainted(page);
  await expect(page.getByText(/Loading the sky/)).toHaveCount(0);
});
