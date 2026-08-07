const { test, expect } = require('@playwright/test');

const VIEWPORT = { width: 1280, height: 1024 };

test.describe('PiP unsupported environment (API absent)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      delete window.documentPictureInPicture;
    });
    await page.setViewportSize(VIEWPORT);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('falls back to floating panel when PiP API is absent', async ({ page }) => {
    await page.locator('#toggle-mode').click();

    await expect(page.locator('#editor-pane')).toBeVisible();

    const position = await page.evaluate(() =>
      window.getComputedStyle(document.getElementById('editor-pane')).position
    );
    expect(position).toBe('fixed');
  });

  test('drag handle is visible in floating panel fallback', async ({ page }) => {
    await page.locator('#toggle-mode').click();

    await expect(page.locator('#editor-drag-handle')).toBeVisible();
  });

  test('body data-mode is edit after toggle when PiP API is absent', async ({ page }) => {
    await page.locator('#toggle-mode').click();

    const mode = await page.evaluate(() => document.body.dataset.mode);
    expect(mode).toBe('edit');
  });

  test('no console errors when PiP API is absent', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));

    await page.locator('#toggle-mode').click();
    await page.waitForTimeout(300);

    expect(errors).toHaveLength(0);
  });

  test('isDocumentPiPSupported returns false when API is absent', async ({ page }) => {
    const supported = await page.evaluate(() => window.Layout.isDocumentPiPSupported());
    expect(supported).toBe(false);
  });
});
