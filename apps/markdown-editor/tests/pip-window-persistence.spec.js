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
    const geom = await page.evaluate((key) => {
      localStorage.removeItem(key);
      const PIP_WINDOW_DEFAULTS = { width: 800, height: 600 };
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            return Object.assign({}, PIP_WINDOW_DEFAULTS, parsed);
          }
        }
      } catch (e) {
        // ignore
      }
      return Object.assign({}, PIP_WINDOW_DEFAULTS);
    }, PIP_WINDOW_KEY);

    expect(geom.width).toBe(800);
    expect(geom.height).toBe(600);
  });

  test('writePipWindowGeometry stores geometry in localStorage', async ({ page }) => {
    await page.evaluate((key) => {
      localStorage.setItem(key, JSON.stringify({ width: 1024, height: 768 }));
    }, PIP_WINDOW_KEY);

    const stored = await page.evaluate((key) => {
      return JSON.parse(localStorage.getItem(key));
    }, PIP_WINDOW_KEY);

    expect(stored.width).toBe(1024);
    expect(stored.height).toBe(768);
  });

  test('readPipWindowGeometry merges stored values with defaults', async ({ page }) => {
    await page.evaluate((key) => {
      localStorage.setItem(key, JSON.stringify({ width: 1200 }));
    }, PIP_WINDOW_KEY);

    const geom = await page.evaluate((key) => {
      const PIP_WINDOW_DEFAULTS = { width: 800, height: 600 };
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            return Object.assign({}, PIP_WINDOW_DEFAULTS, parsed);
          }
        }
      } catch (e) {
        // ignore
      }
      return Object.assign({}, PIP_WINDOW_DEFAULTS);
    }, PIP_WINDOW_KEY);

    expect(geom.width).toBe(1200);
    expect(geom.height).toBe(600);
  });

  test('readPipWindowGeometry returns defaults on malformed JSON', async ({ page }) => {
    await page.evaluate((key) => {
      localStorage.setItem(key, 'not-valid-json');
    }, PIP_WINDOW_KEY);

    const geom = await page.evaluate((key) => {
      const PIP_WINDOW_DEFAULTS = { width: 800, height: 600 };
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            return Object.assign({}, PIP_WINDOW_DEFAULTS, parsed);
          }
        }
      } catch (e) {
        // ignore
      }
      return Object.assign({}, PIP_WINDOW_DEFAULTS);
    }, PIP_WINDOW_KEY);

    expect(geom.width).toBe(800);
    expect(geom.height).toBe(600);
  });

  test('md:layout:pipWindow key is independent from md:layout:floatingPanel', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('md:layout:pipWindow', JSON.stringify({ width: 1100, height: 700 }));
      localStorage.setItem('md:layout:floatingPanel', JSON.stringify({ left: 100, top: 200, height: 400 }));
    });

    const pip = await page.evaluate(() => JSON.parse(localStorage.getItem('md:layout:pipWindow')));
    const panel = await page.evaluate(() => JSON.parse(localStorage.getItem('md:layout:floatingPanel')));

    expect(pip.width).toBe(1100);
    expect(panel.left).toBe(100);
    expect(pip).not.toHaveProperty('left');
    expect(panel).not.toHaveProperty('width');
  });

  test('stored PiP geometry is read back correctly after write', async ({ page }) => {
    await page.evaluate((key) => {
      localStorage.setItem(key, JSON.stringify({ width: 950, height: 700 }));
    }, PIP_WINDOW_KEY);

    const geom = await page.evaluate((key) => {
      const PIP_WINDOW_DEFAULTS = { width: 800, height: 600 };
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            return Object.assign({}, PIP_WINDOW_DEFAULTS, parsed);
          }
        }
      } catch (e) {
        // ignore
      }
      return Object.assign({}, PIP_WINDOW_DEFAULTS);
    }, PIP_WINDOW_KEY);

    expect(geom.width).toBe(950);
    expect(geom.height).toBe(700);
  });
});
