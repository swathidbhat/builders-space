import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const QUESTION =
  'The old charge path still has callers in checkout, including the receipt mailer and the nightly reconciliation job. Should I delete it anyway, or keep it behind a flag until those callers move?';

const SIZES = [
  { width: 390, height: 844, name: '390x844' },
  { width: 844, height: 390, name: '844x390' },
  { width: 768, height: 1024, name: '768x1024' },
  { width: 1280, height: 800, name: '1280x800' },
  { width: 1920, height: 1080, name: '1920x1080' },
] as const;

type Box = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

function overlaps(a: Box, b: Box): boolean {
  return (
    a.right > b.left + 2 && a.left < b.right - 2 && a.bottom > b.top + 2 && a.top < b.bottom - 2
  );
}

async function paintSky(page: Page) {
  await page.goto('/');
  await expect(page.getByText('10 planets discovered')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Loading the sky')).toBeHidden();
  await expect(page.locator('[data-planet-label]:visible').first()).toBeVisible();
}

async function boxOf(page: Page, selector: string): Promise<Box | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!(el instanceof HTMLElement)) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  }, selector);
}

async function tapSize(page: Page, locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
}

test.describe('layout matrix', () => {
  for (const size of SIZES) {
    test(`holds every surface at ${size.name}`, async ({ page }) => {
      test.setTimeout(90_000);
      const narrow = size.width <= 999;
      const phone = size.width <= 480;
      if (size.width === 390 || size.width === 1280) {
        await page.emulateMedia({ reducedMotion: 'reduce' });
      }
      await page.setViewportSize({ width: size.width, height: size.height });
      await paintSky(page);

      const saved = await page.evaluate(() => {
        const store = window.__spaceStore;
        if (!store) throw new Error('space store is not available');
        const projects = store.getState().projects;
        store.setState({
          projects: [],
          snapshotSeen: true,
          connection: 'connected',
          dataStale: false,
          scanStartedAt: Date.now() - 20_000,
          selectedPlanetId: null,
        });
        return projects;
      });
      await expect(page.getByText('No sessions yet')).toBeVisible();
      await page.evaluate((projects) => {
        window.__spaceStore?.setState({
          projects,
          snapshotSeen: true,
          connection: 'connected',
          dataStale: false,
          scanStartedAt: Date.now(),
          selectedPlanetId: null,
        });
      }, saved);
      await expect(page.getByText('10 planets discovered')).toBeVisible();

      const pageBox = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(pageBox.scrollWidth).toBeLessThanOrEqual(pageBox.clientWidth + 1);

      if (narrow) {
        const open = page.getByRole('button', { name: 'Open projects' });
        await expect(open).toBeVisible();
        await tapSize(page, open);
        await open.click();
      }

      const list = page.locator('#projects-nav');
      await expect(list).toBeVisible();
      const listBox = await boxOf(page, '#projects-nav');
      expect(listBox).not.toBeNull();
      if (!listBox) return;
      if (phone) expect(listBox.width).toBeGreaterThanOrEqual(size.width - 8);
      else {
        expect(listBox.width).toBeGreaterThanOrEqual(200);
        expect(listBox.width).toBeLessThanOrEqual(280);
      }
      expect(listBox.right).toBeLessThanOrEqual(size.width + 1);
      expect(listBox.bottom).toBeLessThanOrEqual(size.height + 1);
      const scrollsInside = await list.evaluate((nav) => {
        const scroller = [...nav.querySelectorAll('div')].find(
          (el) => getComputedStyle(el).overflowY === 'auto',
        );
        return scroller instanceof HTMLElement;
      });
      expect(scrollsInside).toBe(true);

      const showMore = list.getByRole('button', { name: 'Show more' }).first();
      if (await showMore.count()) await tapSize(page, showMore);
      const row = list.locator('[data-project-id]').first();
      await tapSize(page, row);

      const billing = list.getByRole('button', { name: /Billing Question Backfill/ });
      await billing.click();
      const panel = page.getByRole('complementary', { name: 'Project details' });
      await expect(panel).toBeVisible();

      const panelBox = await boxOf(page, 'aside[aria-label="Project details"]');
      expect(panelBox).not.toBeNull();
      if (!panelBox) return;
      if (narrow) {
        await expect(page.getByRole('button', { name: 'Open projects' })).toHaveCount(0);
        const wideList = await boxOf(page, '#projects-nav');
        expect(wideList === null || wideList.width < 80).toBe(true);
        expect(panelBox.width).toBeGreaterThanOrEqual(Math.min(300, size.width - 16));
        expect(panelBox.width).toBeGreaterThanOrEqual(size.width - 32);
      } else {
        const beside = await boxOf(page, '#projects-nav');
        expect(beside).not.toBeNull();
        if (!beside) return;
        expect(beside.width).toBeGreaterThanOrEqual(200);
        expect(beside.width).toBeLessThanOrEqual(280);
        expect(panelBox.width).toBeGreaterThanOrEqual(380);
        expect(overlaps(beside, panelBox)).toBe(false);
      }

      const hud = await boxOf(page, 'header');
      const dock = await boxOf(page, '[data-bottom-dock]');
      if (hud) expect(overlaps(hud, panelBox)).toBe(false);
      if (dock) expect(overlaps(dock, panelBox)).toBe(false);

      const question = panel.locator('[data-agent-question]').first();
      await expect(question).toContainText(QUESTION);
      const placed = await question.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const sheet = el.closest('aside');
        if (!(sheet instanceof HTMLElement)) return null;
        const visibleBottom = sheet.getBoundingClientRect().top + sheet.clientHeight;
        return {
          top: rect.top,
          bottom: rect.bottom,
          visibleBottom,
          scrollTop: sheet.scrollTop,
          vh: window.innerHeight,
        };
      });
      expect(placed).not.toBeNull();
      if (!placed) return;
      expect(placed.scrollTop).toBe(0);
      expect(placed.top).toBeGreaterThanOrEqual(0);
      expect(placed.bottom).toBeLessThanOrEqual(placed.vh + 1);
      expect(placed.bottom).toBeLessThanOrEqual(placed.visibleBottom + 1);

      const closer = narrow
        ? page.getByRole('button', { name: 'Back to projects' })
        : page.getByRole('button', { name: 'Close project details' });
      await tapSize(page, closer);
      const panelMore = panel.getByRole('button', { name: 'Show more' }).first();
      await expect(panelMore).toBeVisible();
      await tapSize(page, panelMore);

      if (size.width === 390 || size.width === 1280) {
        const animation = await panel.evaluate((el) => getComputedStyle(el).animationName);
        expect(animation).toBe('none');
      }

      await page.evaluate(() => {
        const store = window.__spaceStore;
        if (!store) throw new Error('space store is not available');
        store.setState({
          connection: 'stale',
          dataStale: true,
          lastUpdated: Date.parse('2026-10-12T16:52:00'),
          markSocketUp: () => undefined,
        });
      });
      const banner = page.getByText('Disconnected — retrying');
      await expect(banner).toBeVisible();
      const bannerBox = await banner.boundingBox();
      const sheetNow = await boxOf(page, 'aside[aria-label="Project details"]');
      expect(bannerBox).not.toBeNull();
      expect(sheetNow).not.toBeNull();
      if (bannerBox && sheetNow) {
        expect(
          overlaps(
            {
              left: bannerBox.x,
              top: bannerBox.y,
              right: bannerBox.x + bannerBox.width,
              bottom: bannerBox.y + bannerBox.height,
              width: bannerBox.width,
              height: bannerBox.height,
            },
            sheetNow,
          ),
        ).toBe(false);
      }

      const horizontal = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(horizontal.scrollWidth).toBeLessThanOrEqual(horizontal.clientWidth + 1);

      const results = await new AxeBuilder({ page }).analyze();
      const bad = results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      );
      expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
    });
  }
});

test('keyboard returns from a phone project to its row', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await paintSky(page);
  await page.getByRole('button', { name: 'Open projects' }).click();
  const billing = page.locator('#projects-nav [data-project-id]', {
    hasText: 'Billing Question Backfill',
  });
  await billing.focus();
  const id = await billing.getAttribute('data-project-id');
  expect(id).toBeTruthy();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Project details' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open projects' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary', { name: 'Project details' })).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-project-id')))
    .toBe(id);
});
