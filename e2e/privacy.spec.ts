import { expect, test } from '@playwright/test';
import { assertSkyPainted } from './paintedSky';

test('the page makes no third-party requests on load', async ({ page }) => {
  const hosts: string[] = [];
  page.on('request', (request) => {
    try {
      const host = new URL(request.url()).hostname;
      if (host !== '127.0.0.1' && host !== 'localhost') hosts.push(`${host} ${request.url()}`);
    } catch {
      hosts.push(request.url());
    }
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.getByText('10 planets discovered')).toBeVisible({ timeout: 20_000 });
  await assertSkyPainted(page);
  expect(hosts, hosts.join('\n')).toEqual([]);
});
