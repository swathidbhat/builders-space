import { expect, test } from '@playwright/test';

const COUNT_FRAMES = `
(() => {
  const bump = (key) => {
    const record = (window.__bsFrames = window.__bsFrames || { gl: 0, surface: 0 });
    record[key] += 1;
  };
  const wrapClear = (proto) => {
    if (!proto || proto.__bsClear) return;
    const orig = proto.clear;
    proto.clear = function (mask) {
      if ((mask & 0x4000) !== 0) bump('gl');
      return orig.call(this, mask);
    };
    proto.__bsClear = true;
  };
  wrapClear(WebGLRenderingContext.prototype);
  if (typeof WebGL2RenderingContext !== 'undefined') wrapClear(WebGL2RenderingContext.prototype);
  const origClearRect = CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect = function (x, y, w, h) {
    if (w >= 64 && h >= 32) bump('surface');
    return origClearRect.call(this, x, y, w, h);
  };
})();
`;

async function frames(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const record = (window as Window & { __bsFrames?: { gl: number; surface: number } }).__bsFrames;
    return record ?? { gl: 0, surface: 0 };
  });
}

async function setVisibility(page: import('@playwright/test').Page, value: 'hidden' | 'visible') {
  await page.evaluate((next) => {
    const state = { value: next };
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => state.value,
    });
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => state.value === 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, value);
}

test('idle sky stays under the frame budget and pauses while hidden', async ({ page }) => {
  await page.addInitScript(COUNT_FRAMES);
  await page.goto('/');
  await expect(page.getByText('10 planets discovered')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(4_000);

  const idleStart = await frames(page);
  await page.waitForTimeout(10_000);
  const idleEnd = await frames(page);
  const idleGl = idleEnd.gl - idleStart.gl;
  expect(idleGl).toBeLessThan(50);

  await setVisibility(page, 'hidden');
  await page.waitForTimeout(400);
  const hiddenStart = await frames(page);
  await page.waitForTimeout(5_000);
  const hiddenEnd = await frames(page);
  expect(hiddenEnd.gl - hiddenStart.gl).toBe(0);
  expect(hiddenEnd.surface - hiddenStart.surface).toBe(0);

  await setVisibility(page, 'visible');
  await page.waitForTimeout(1_000);
  const resumed = await frames(page);
  expect(resumed.gl).toBeGreaterThan(hiddenEnd.gl);
});
