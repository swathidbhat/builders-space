/**
 * Record the README stills and GIFs from the fixture sessions.
 * Usage: npm run docs:media
 *
 * Uses the Playwright Chromium from the e2e install, plus ffmpeg.
 * Writes docs/media/ and copies the same files to /opt/cursor/artifacts/readme-media/.
 */
import { execFile, execFileSync, spawn } from 'node:child_process';
import { get as httpGet } from 'node:http';
import { createConnection } from 'node:net';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const exec = promisify(execFile);
const ROOT = join(import.meta.dirname, '..');
const MEDIA = join(ROOT, 'docs', 'media');
const ARTIFACTS = '/opt/cursor/artifacts/readme-media';
const VIDEO_DIR = join(tmpdir(), 'builders-space-docs-video');
const APP = 'http://127.0.0.1:5174';
const QUESTION = /Should I delete it anyway/;
const MAX_GIF_BYTES = 4 * 1024 * 1024;
const GL_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--enable-unsafe-swiftshader',
];

function log(message) {
  process.stdout.write(`${message}\n`);
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    const done = (open) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

function httpReady() {
  return new Promise((resolve) => {
    const req = httpGet(APP, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitUntil(check, label, timeoutMs = 40_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(250);
  }
  throw new Error(label);
}

function listeners(port) {
  try {
    return execFileSync('lsof', ['-t', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function killListeners() {
  for (const port of [5174, 3002]) {
    for (const pid of listeners(port)) {
      try {
        process.kill(Number(pid), 'SIGKILL');
      } catch {
        // already gone
      }
    }
  }
}

function publish(name) {
  const from = join(MEDIA, name);
  copyFileSync(from, join(ARTIFACTS, name));
  const size = statSync(from).size;
  log(`${name} ${(size / 1024).toFixed(0)} KB`);
  return size;
}

async function paint(page) {
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.getByText('10 planets discovered').waitFor({ timeout: 25_000 });
  await page.getByText('Loading the sky').waitFor({ state: 'hidden', timeout: 25_000 });
  await page.locator('[data-planet-label]:visible').first().waitFor();
  /* eslint-disable no-undef -- this callback runs in the browser page */
  await page.evaluate(async () => {
    await document.fonts.load('600 22px Figtree');
    await document.fonts.load('400 16px Figtree');
    await document.fonts.ready;
  });
  /* eslint-enable no-undef */
  await page.waitForTimeout(900);
}

async function openBilling(page) {
  await page.getByRole('button', { name: /Billing Question Backfill/ }).click();
  const panel = page.getByRole('complementary', { name: 'Project details' });
  await panel.waitFor();
  await panel.getByText(QUESTION).waitFor();
  await page.getByText('Loading the sky').waitFor({ state: 'hidden' });
  await page.locator('[data-planet-label]:visible').first().waitFor();
}

async function hoverPlanet(page, name) {
  const label = page.locator('[data-planet-label]').filter({ hasText: name }).first();
  await label.waitFor();
  const box = await label.boundingBox();
  if (!box) throw new Error(`no box for ${name}`);
  const x = box.x + box.width / 2;
  const points = [];
  for (let dy = 12; dy <= 220; dy += 10) points.push([x, box.y + box.height + dy]);
  for (let dy = 12; dy <= 100; dy += 10) points.push([x, box.y - dy]);
  for (const [px, py] of points) {
    if (py < 8 || py > 790 || px < 8 || px > 1270) continue;
    await page.mouse.move(px, py);
    await delay(50);
    const hot = await page
      .locator('[data-planet-label]')
      .evaluateAll((els) => els.some((el) => String(el.className).includes('hot')));
    if (hot) return { x: px, y: py };
  }
  throw new Error(`could not hover ${name}`);
}

async function encodeFrames(dir, gif, { count, elapsed, width, fps, colors }) {
  const duration = Math.min(Math.max(elapsed, 0.1), 12);
  const playFps = count / duration;
  const palette = `${gif}.palette.png`;
  const filters = `fps=${fps},scale=${width}:-1:flags=lanczos`;
  const input = ['-y', '-framerate', playFps.toFixed(3), '-i', join(dir, 'f%04d.jpg')];
  await exec('ffmpeg', [
    ...input,
    '-vf',
    `${filters},palettegen=max_colors=${colors}:stats_mode=diff`,
    palette,
  ]);
  await exec('ffmpeg', [
    ...input,
    '-i',
    palette,
    '-lavfi',
    `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3`,
    '-loop',
    '0',
    gif,
  ]);
  rmSync(palette, { force: true });
}

async function recordGif(browser, { width, height, file, outWidth, run }) {
  const dir = join(VIDEO_DIR, file.replace(/\W/g, '-'));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width, height } });
  page.setDefaultTimeout(20_000);
  const client = await page.context().newCDPSession(page);
  const frames = [];
  let ack = Promise.resolve();
  client.on('Page.screencastFrame', (frame) => {
    const path = join(dir, `f${String(frames.length).padStart(4, '0')}.jpg`);
    writeFileSync(path, Buffer.from(frame.data, 'base64'));
    frames.push({ path, at: Date.now() });
    ack = ack.then(() =>
      client.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => undefined),
    );
  });
  try {
    await paint(page);
    frames.length = 0;
    await client.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 80,
      maxWidth: width,
      maxHeight: height,
      everyNthFrame: 1,
    });
    const started = Date.now();
    await run(page);
    const ended = Date.now();
    await client.send('Page.stopScreencast');
    await ack;
    if (frames.length < 2) throw new Error(`${file} captured ${frames.length} frames`);
    const elapsed = (ended - started) / 1000;
    log(`${file} ${frames.length} frames over ${elapsed.toFixed(1)}s`);
    const gif = join(MEDIA, file);
    const passes = [
      { fps: 10, colors: 80 },
      { fps: 8, colors: 48 },
      { fps: 6, colors: 32 },
    ];
    for (const pass of passes) {
      await encodeFrames(dir, gif, { count: frames.length, elapsed, width: outWidth, ...pass });
      if (statSync(gif).size <= MAX_GIF_BYTES) break;
      log(`${file} over 4MB at ${pass.fps}fps, trying a smaller encode`);
    }
    if (statSync(gif).size > MAX_GIF_BYTES) throw new Error(`${file} is still over 4MB`);
    publish(file);
  } finally {
    await page.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

async function shot(browser, { width, height, file, prepare }) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.setDefaultTimeout(20_000);
  try {
    await paint(page);
    if (prepare) await prepare(page);
    await page.screenshot({ path: join(MEDIA, file) });
    publish(file);
  } finally {
    await page.close();
  }
}

function readRuntime() {
  return JSON.parse(readFileSync(join(ROOT, 'e2e', '.runtime.json'), 'utf8'));
}

function restartApi(home) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: ROOT,
    env: { ...process.env, HOME: home },
    stdio: 'inherit',
  });
  writeFileSync(join(ROOT, 'e2e', '.runtime.json'), JSON.stringify({ home, pid: child.pid }));
  return child;
}

async function main() {
  if ((await portOpen(5174)) || (await portOpen(3002))) {
    throw new Error('Ports 5174 and 3002 must be free before npm run docs:media');
  }
  mkdirSync(MEDIA, { recursive: true });
  mkdirSync(ARTIFACTS, { recursive: true });

  const stack = spawn(process.execPath, ['e2e/start.mjs'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  const browser = await chromium.launch({ args: GL_ARGS });
  let restarted = null;

  try {
    await waitUntil(httpReady, 'dashboard did not start', 60_000);
    log('dashboard up');

    await shot(browser, { width: 1280, height: 800, file: 'hero-1280x800.png' });
    await shot(browser, {
      width: 1280,
      height: 800,
      file: 'project-open-1280x800.png',
      prepare: openBilling,
    });
    await shot(browser, {
      width: 390,
      height: 844,
      file: 'phone-list-390x844.png',
      prepare: async (page) => {
        await page.getByRole('button', { name: 'Open projects' }).click();
        await page.getByRole('button', { name: /Billing Question Backfill/ }).waitFor();
      },
    });
    await shot(browser, {
      width: 390,
      height: 844,
      file: 'phone-project-390x844.png',
      prepare: async (page) => {
        await page.getByRole('button', { name: 'Open projects' }).click();
        await openBilling(page);
      },
    });

    await recordGif(browser, {
      width: 1280,
      height: 800,
      outWidth: 960,
      file: 'overview.gif',
      run: async (page) => {
        await delay(2500);
        const point = await hoverPlanet(page, 'Billing Question Backfill');
        await delay(1800);
        await page.mouse.click(point.x, point.y);
        const panel = page.getByRole('complementary', { name: 'Project details' });
        await panel.getByText(QUESTION).waitFor();
        await delay(5000);
      },
    });

    await recordGif(browser, {
      width: 390,
      height: 844,
      outWidth: 390,
      file: 'phone.gif',
      run: async (page) => {
        await delay(1600);
        await page.getByRole('button', { name: 'Open projects' }).click();
        const billing = page.getByRole('button', { name: /Billing Question Backfill/ });
        await billing.waitFor();
        await delay(2200);
        await billing.click();
        await page
          .getByRole('complementary', { name: 'Project details' })
          .getByText(QUESTION)
          .waitFor();
        await delay(2800);
        await page.getByRole('button', { name: 'Back to projects' }).click();
        await billing.waitFor();
        await delay(2400);
      },
    });

    await recordGif(browser, {
      width: 1280,
      height: 800,
      outWidth: 960,
      file: 'disconnect.gif',
      run: async (page) => {
        await delay(2000);
        const runtime = readRuntime();
        process.kill(runtime.pid, 'SIGTERM');
        await page.getByRole('status').filter({ hasText: 'Disconnected — retrying' }).waitFor({
          timeout: 20_000,
        });
        await page.screenshot({ path: join(MEDIA, 'disconnected-1280x800.png') });
        publish('disconnected-1280x800.png');
        await delay(2800);
        restarted = restartApi(runtime.home);
        await page.getByText('10 planets discovered', { exact: true }).waitFor({ timeout: 30_000 });
        await page
          .getByRole('status')
          .filter({ hasText: 'Disconnected — retrying' })
          .waitFor({ state: 'hidden', timeout: 30_000 });
        await page.locator('[data-planet-label]:visible').first().waitFor();
        await delay(2800);
      },
    });
  } finally {
    await browser.close();
    if (restarted && !restarted.killed) restarted.kill('SIGTERM');
    stack.kill('SIGTERM');
    await delay(800);
    killListeners();
  }

  await emptySky(browserLaunch);
}

async function browserLaunch() {
  return chromium.launch({ args: GL_ARGS });
}

async function emptySky(launch) {
  await waitUntil(
    async () => !(await portOpen(5174)) && !(await portOpen(3002)),
    'ports stayed busy',
    20_000,
  );
  const home = mkdtempSync(join(tmpdir(), 'bs-docs-empty-'));
  const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: ROOT,
    env: { ...process.env, HOME: home },
    stdio: 'inherit',
  });
  const client = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5174', '--strictPort'], {
    cwd: ROOT,
    env: { ...process.env, HOME: home },
    stdio: 'inherit',
  });
  const browser = await launch();
  try {
    await waitUntil(httpReady, 'empty dashboard did not start', 60_000);
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.getByRole('heading', { name: 'No sessions yet' }).waitFor({ timeout: 25_000 });
    await page.getByText('Loading the sky').waitFor({ state: 'hidden', timeout: 20_000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(MEDIA, 'empty-1280x800.png') });
    publish('empty-1280x800.png');
    await page.close();
  } finally {
    await browser.close();
    server.kill('SIGTERM');
    client.kill('SIGTERM');
    await delay(500);
    killListeners();
  }
}

main().catch((error) => {
  log(error.stack || String(error));
  killListeners();
  process.exit(1);
});
