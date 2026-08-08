const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 1024 });
  await page.addInitScript(() => {
    try {
      const storageClearedMarker = '__pw_storage_cleared__';
      if (window.name !== storageClearedMarker) {
        window.localStorage && window.localStorage.clear();
        window.sessionStorage && window.sessionStorage.clear();
        window.name = storageClearedMarker;
      }
    } catch (error) {
      // Ignore storage access errors in test environment.
    }
    window.__lastPreviewScrollTarget = null;
  });
  await page.goto('/');
  await page.click('#toggle-mode');
});

test('script tag in markdown is neutralised and does not execute', async ({ page }) => {
  let dialogFired = false;
  page.on('dialog', async dialog => {
    dialogFired = true;
    await dialog.dismiss();
  });

  await page.fill('#editor', '<script>window.__xssFired = true;<\/script>\n\nHello');
  await page.waitForTimeout(400);

  const preview = page.locator('#preview');
  await expect(preview).toContainText('Hello');
  await expect(preview.locator('script')).toHaveCount(0);
  const fired = await page.evaluate(() => window.__xssFired === true);
  expect(fired).toBe(false);
  expect(dialogFired).toBe(false);
});

test('img onerror handler is stripped from rendered output', async ({ page }) => {
  await page.fill('#editor', '<img src=x onerror=alert(1)>');
  await page.waitForTimeout(400);

  const preview = page.locator('#preview');
  const img = preview.locator('img[src="x"]');
  await expect(img).toHaveCount(1);
  const onerrorAttr = await img.getAttribute('onerror');
  expect(onerrorAttr).toBeNull();
});

test('javascript: link href is neutralised', async ({ page }) => {
  await page.fill('#editor', '[link](javascript:alert(1))');
  await page.waitForTimeout(400);

  const preview = page.locator('#preview');
  const link = preview.locator('a', { hasText: 'link' });
  await expect(link).toHaveCount(1);
  const href = await link.getAttribute('href');
  expect(href === null || !href.toLowerCase().startsWith('javascript:')).toBe(true);
});

test('mermaid click directive injection does not run script and mermaid renders in strict mode', async ({ page }) => {
  let dialogFired = false;
  page.on('dialog', async dialog => {
    dialogFired = true;
    await dialog.dismiss();
  });

  const mermaidWithClick = [
    '```mermaid',
    'graph TD',
    'A[Start] --> B[End]',
    'click A "javascript:alert(1)"',
    '```',
  ].join('\n');

  await page.fill('#editor', mermaidWithClick);
  await page.waitForTimeout(600);

  const fired = await page.evaluate(() => window.__xssFired === true);
  expect(fired).toBe(false);
  expect(dialogFired).toBe(false);
});

test('preview shows a safety error instead of unsanitized HTML when DOMPurify fails to load', async ({ page }) => {
  await page.route('**/vendor/purify.min.js', route => route.fulfill({ status: 404, body: '' }));
  await page.goto('/');
  await page.click('#toggle-mode');

  await page.fill('#editor', '<script>window.__xssFired = true;<\/script>\n\nHello');
  await page.waitForTimeout(400);

  const preview = page.locator('#preview');
  await expect(preview.locator('.preview-sanitizer-error')).toBeVisible();
  await expect(preview).not.toContainText('Hello');
  const fired = await page.evaluate(() => window.__xssFired === true);
  expect(fired).toBe(false);
});
