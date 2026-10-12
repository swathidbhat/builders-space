import { inflateSync } from 'node:zlib';
import { expect, type Page } from '@playwright/test';

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDelta = Math.abs(estimate - left);
  const upDelta = Math.abs(estimate - up);
  const upLeftDelta = Math.abs(estimate - upLeft);
  if (leftDelta <= upDelta && leftDelta <= upLeftDelta) return left;
  if (upDelta <= upLeftDelta) return up;
  return upLeft;
}

/** Share of sampled pixels that are brighter than the empty sky. */
export function pngBrightFraction(png: Buffer): number {
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  const idats: Buffer[] = [];
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') {
      idats.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  const inflated = inflateSync(Buffer.concat(idats));
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const rows = Buffer.alloc(height * stride);
  let input = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[input];
    input += 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[input];
      input += 1;
      const left = x >= channels ? rows[y * stride + x - channels] : 0;
      const up = y > 0 ? rows[(y - 1) * stride + x] : 0;
      const upLeft = x >= channels && y > 0 ? rows[(y - 1) * stride + x - channels] : 0;
      let value = raw;
      if (filter === 1) value = (raw + left) & 255;
      else if (filter === 2) value = (raw + up) & 255;
      else if (filter === 3) value = (raw + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) value = (raw + paeth(left, up, upLeft)) & 255;
      rows[y * stride + x] = value;
    }
  }

  let bright = 0;
  let total = 0;
  for (let y = 0; y < height; y += 3) {
    for (let x = 0; x < width; x += 3) {
      const index = y * stride + x * channels;
      const sum = rows[index] + rows[index + 1] + rows[index + 2];
      total += 1;
      if (sum > 90) bright += 1;
    }
  }
  return total === 0 ? 0 : bright / total;
}

/** Fail if the lazy sky never mounts or the canvas stays blank. */
export async function assertSkyPainted(page: Page): Promise<void> {
  const sky = page.getByRole('main', { name: 'Project sky' }).locator('canvas');
  await expect(page.getByText(/Loading the sky/)).toHaveCount(0, { timeout: 20_000 });
  await expect(sky).toBeVisible();
  await expect(page.locator('[data-planet-label]:visible').first()).toBeVisible();
  const shot = await sky.screenshot();
  const bright = pngBrightFraction(shot);
  expect(bright, `canvas bright fraction ${bright}`).toBeGreaterThan(0.02);
}
