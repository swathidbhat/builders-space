import { mkdirSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const ARTIFACTS = '/opt/cursor/artifacts/responsive-accessible';

const SIZES = [
  { width: 1920, height: 1080, name: '1920x1080' },
  { width: 1280, height: 800, name: '1280x800' },
  { width: 800, height: 900, name: '800x900' },
] as const;

async function saveShot(page: Page, name: string) {
  await page.screenshot({ path: test.info().outputPath(name) });
  try {
    mkdirSync(ARTIFACTS, { recursive: true });
    await page.screenshot({ path: `${ARTIFACTS}/${name}` });
  } catch {
    // GitHub's runner may not allow this path. Playwright still keeps outputPath.
  }
}

async function settleSky(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('space:hooks-seen', '1');
  });
  await page.goto('/');
  await expect(page.getByText('10 planets discovered')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-planet-label]:visible').first()).toBeVisible();
  await expect(page.getByText(/No Anthropic API key is set/)).toBeVisible();
  await page.evaluate(() => {
    const store = window.__spaceStore;
    if (!store) throw new Error('space store is not available');
    store.setState({
      connection: 'stale',
      dataStale: true,
      markSocketUp: () => undefined,
    });
  });
  await expect(page.getByText('Disconnected — retrying')).toBeVisible();
  await page.waitForTimeout(400);
}

async function assertNeedsYouName(page: Page) {
  const open = await page.getByRole('region', { name: 'Needs you' }).isVisible();
  if (!open) return;
  const name = page.locator('[data-project-name]', { hasText: 'Lumen Lab' }).first();
  await expect(name).toBeVisible();
  const fit = await name.evaluate((el) => ({
    text: el.textContent,
    overflow: el.scrollWidth - el.clientWidth,
  }));
  expect(fit.text).toBe('Lumen Lab');
  expect(fit.overflow).toBeLessThanOrEqual(1);
  const navWidth = await page
    .locator('#projects-nav')
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(navWidth).toBeGreaterThan(200);
  expect(navWidth).toBeLessThan(280);
  await expect(
    page.getByRole('region', { name: 'Needs you' }).getByRole('button', { name: /Lumen Lab/ }),
  ).toHaveAttribute('title', /Lumen Lab/);
}

function intersects(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
) {
  return (
    a.right > b.left + 2 && a.left < b.right - 2 && a.bottom > b.top + 2 && a.top < b.bottom - 2
  );
}

async function assertReadableLayout(page: Page) {
  const header = page.getByRole('banner');
  await expect(header.getByText('Agents')).toBeVisible();
  await expect(header.getByText('Working')).toBeVisible();
  await expect(header.getByText('Errors')).toBeVisible();
  await expect(header.getByText('Awaiting you')).toBeVisible();
  await expect(
    page.locator('[data-planet-label]:visible').filter({ hasText: 'error' }).first(),
  ).toBeVisible();

  const layout = await page.evaluate(() => {
    function boxOf(el: Element) {
      const rect = el.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    }
    function shown(el: Element) {
      let node: Element | null = el;
      while (node) {
        const style = getComputedStyle(node);
        if (
          style.visibility === 'hidden' ||
          style.display === 'none' ||
          Number(style.opacity) === 0
        ) {
          return false;
        }
        node = node.parentElement;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1;
    }
    const header = document.querySelector('header');
    const counters = document.querySelector('[data-counters]');
    const panel = document.querySelector('aside[aria-label="Project details"]');
    const projects = document.querySelector('nav[aria-label="Projects"]');
    const hooks = document.querySelector('[data-overlay="hooks"]');
    const overlays = [...document.querySelectorAll('[data-overlay]')]
      .filter(shown)
      .flatMap((el) => {
        const name = el.getAttribute('data-overlay') ?? '';
        const box = boxOf(el);
        if (name === 'projects' && box.right - box.left < 100) return [];
        return [{ ...box, name }];
      });
    const labels = [...document.querySelectorAll('[data-planet-label]')].filter(shown).map((el) => {
      return {
        ...boxOf(el),
        text: (el.textContent ?? '').slice(0, 40),
      };
    });
    return {
      header: header ? boxOf(header) : null,
      counters: counters ? boxOf(counters) : null,
      panel: panel ? boxOf(panel) : null,
      projects: projects && projects.getBoundingClientRect().width > 100 ? boxOf(projects) : null,
      hooks: hooks && hooks.getBoundingClientRect().height > 20 ? boxOf(hooks) : null,
      overlays,
      labels,
      canvas: document.querySelector('canvas') ? boxOf(document.querySelector('canvas')!) : null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });

  expect(layout.counters).not.toBeNull();
  if (!layout.counters || !layout.header) return;
  expect(layout.counters.top).toBeGreaterThanOrEqual(0);
  expect(layout.counters.bottom).toBeLessThanOrEqual(layout.viewport.height);
  expect(layout.counters.right).toBeLessThanOrEqual(layout.viewport.width);
  expect(layout.counters.left).toBeGreaterThanOrEqual(0);
  expect(layout.labels.length).toBeGreaterThan(0);

  if (layout.panel && layout.panel.bottom - layout.panel.top > 20) {
    expect(intersects(layout.counters, layout.panel)).toBe(false);
    expect(intersects(layout.header, layout.panel)).toBe(false);
  }
  for (const label of layout.labels) {
    expect(intersects(label, layout.header), label.text).toBe(false);
    if (layout.projects) expect(intersects(label, layout.projects), label.text).toBe(false);
    if (layout.panel && layout.panel.bottom - layout.panel.top > 20) {
      expect(intersects(label, layout.panel), label.text).toBe(false);
    }
    if (layout.hooks) expect(intersects(label, layout.hooks), label.text).toBe(false);
  }
  for (let i = 0; i < layout.labels.length; i++) {
    for (let j = i + 1; j < layout.labels.length; j++) {
      expect(
        intersects(layout.labels[i], layout.labels[j]),
        `${layout.labels[i].text} overlaps ${layout.labels[j].text}`,
      ).toBe(false);
    }
  }

  const chrome = layout.overlays.filter((overlay) => overlay.name !== 'dock');
  expect(chrome.some((overlay) => overlay.name === 'notice')).toBe(true);
  expect(chrome.some((overlay) => overlay.name === 'disconnect')).toBe(true);
  expect(chrome.some((overlay) => overlay.name === 'legend')).toBe(true);
  expect(chrome.some((overlay) => overlay.name === 'hooks')).toBe(true);
  for (let i = 0; i < chrome.length; i++) {
    for (let j = i + 1; j < chrome.length; j++) {
      expect(intersects(chrome[i], chrome[j]), `${chrome[i].name} overlaps ${chrome[j].name}`).toBe(
        false,
      );
    }
  }
  for (const label of layout.labels) {
    for (const overlay of chrome) {
      if (overlay.name === 'hud') continue;
      expect(intersects(label, overlay), `${label.text} overlaps ${overlay.name}`).toBe(false);
    }
  }
}

test('has no serious or critical accessibility violations', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.getByText('10 planets discovered')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('complementary', { name: 'Hooks' })).toBeVisible();
  const wide = await new AxeBuilder({ page }).analyze();
  const wideBad = wide.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(wideBad, JSON.stringify(wideBad, null, 2)).toEqual([]);

  await page.setViewportSize({ width: 800, height: 900 });
  await expect(page.getByRole('button', { name: 'Open projects' })).toBeVisible();
  const narrow = await new AxeBuilder({ page }).analyze();
  const narrowBad = narrow.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(narrowBad, JSON.stringify(narrowBad, null, 2)).toEqual([]);
});

test('keyboard opens a needs-you project and escape closes it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Needs you' })).toBeVisible({ timeout: 20_000 });

  let focused = false;
  for (let step = 0; step < 30 && !focused; step++) {
    await page.keyboard.press('Tab');
    focused = await page.evaluate(
      () => document.activeElement?.closest('[aria-label="Needs you"]') != null,
    );
  }
  expect(focused).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Project details' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary', { name: 'Project details' })).toHaveCount(0);
});

for (const size of SIZES) {
  test(`layout holds at ${size.name} with 10 projects`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await settleSky(page);
    await assertReadableLayout(page);
    await assertNeedsYouName(page);
    await saveShot(page, `overview-${size.name}.png`);

    if (size.width <= 999) {
      await page.getByRole('button', { name: 'Open projects' }).click();
    }
    await page.getByRole('region', { name: 'Needs you' }).getByRole('button').first().click();
    await expect(page.getByRole('complementary', { name: 'Project details' })).toBeVisible();
    await page.waitForTimeout(1000);
    await saveShot(page, `panel-${size.name}.png`);
    await assertReadableLayout(page);
    await assertNeedsYouName(page);
  });
}

test('layout holds at 800x640 with the bottom overlays', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 640 });
  await settleSky(page);
  await assertReadableLayout(page);
  await page.getByRole('button', { name: 'Open projects' }).click();
  await page.getByRole('region', { name: 'Needs you' }).getByRole('button').first().click();
  await expect(page.getByRole('complementary', { name: 'Project details' })).toBeVisible();
  await page.waitForTimeout(1000);
  await assertReadableLayout(page);
  await assertNeedsYouName(page);
});
