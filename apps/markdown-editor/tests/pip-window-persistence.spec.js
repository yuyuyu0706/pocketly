const { test, expect } = require('@playwright/test');

const VIEWPORT = { width: 1280, height: 1024 };
const PIP_WINDOW_KEY = 'md:layout:pipWindow';

test.describe('PiP window geometry persistence (localStorage)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      delete window.documentPictureInPicture;
    });
    await page.setViewportSize(VIEWPORT);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('readPipWindowGeometry returns defaults when localStorage is empty', async ({ page }) => {
    await page.evaluate((key) => localStorage.removeItem(key), PIP_WINDOW_KEY);

    const geom = await page.evaluate(() => window.__pipWindowGeometry.read());

    expect(geom.width).toBe(800);
    expect(geom.height).toBe(600);
  });

  test('writePipWindowGeometry stores geometry in localStorage', async ({ page }) => {
    await page.evaluate(() => window.__pipWindowGeometry.write({ width: 1024, height: 768 }));

    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PIP_WINDOW_KEY);

    expect(stored.width).toBe(1024);
    expect(stored.height).toBe(768);
  });

  test('readPipWindowGeometry returns written values', async ({ page }) => {
    await page.evaluate(() => window.__pipWindowGeometry.write({ width: 1024, height: 768 }));

    const geom = await page.evaluate(() => window.__pipWindowGeometry.read());

    expect(geom.width).toBe(1024);
    expect(geom.height).toBe(768);
  });

  test('readPipWindowGeometry merges stored values with defaults', async ({ page }) => {
    await page.evaluate((key) => {
      localStorage.setItem(key, JSON.stringify({ width: 1200 }));
    }, PIP_WINDOW_KEY);

    const geom = await page.evaluate(() => window.__pipWindowGeometry.read());

    expect(geom.width).toBe(1200);
    expect(geom.height).toBe(600);
  });

  test('readPipWindowGeometry returns defaults on malformed JSON', async ({ page }) => {
    await page.evaluate((key) => {
      localStorage.setItem(key, 'not-valid-json');
    }, PIP_WINDOW_KEY);

    const geom = await page.evaluate(() => window.__pipWindowGeometry.read());

    expect(geom.width).toBe(800);
    expect(geom.height).toBe(600);
  });

  test('md:layout:pipWindow key is independent from md:layout:floatingPanel', async ({ page }) => {
    await page.evaluate(() => {
      window.__pipWindowGeometry.write({ width: 1100, height: 700 });
      localStorage.setItem('md:layout:floatingPanel', JSON.stringify({ left: 100, top: 200, height: 400 }));
    });

    const pip = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PIP_WINDOW_KEY);
    const panel = await page.evaluate(() => JSON.parse(localStorage.getItem('md:layout:floatingPanel')));

    expect(pip.width).toBe(1100);
    expect(panel.left).toBe(100);
    expect(pip).not.toHaveProperty('left');
    expect(panel).not.toHaveProperty('width');
  });

  test('getPipRequestOptions returns stored geometry with disallowReturnToOpener', async ({ page }) => {
    await page.evaluate(() => window.__pipWindowGeometry.write({ width: 950, height: 700 }));

    const opts = await page.evaluate(() => window.__pipWindowGeometry.getRequestOptions());

    expect(opts.width).toBe(950);
    expect(opts.height).toBe(700);
    expect(opts.disallowReturnToOpener).toBe(true);
  });

  test('getPipRequestOptions returns defaults when localStorage is empty', async ({ page }) => {
    await page.evaluate((key) => localStorage.removeItem(key), PIP_WINDOW_KEY);

    const opts = await page.evaluate(() => window.__pipWindowGeometry.getRequestOptions());

    expect(opts.width).toBe(800);
    expect(opts.height).toBe(600);
    expect(opts.disallowReturnToOpener).toBe(true);
  });
});
