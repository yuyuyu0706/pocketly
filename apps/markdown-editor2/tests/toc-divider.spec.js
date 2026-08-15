const { test, expect } = require('@playwright/test');

// Regression test for PR #197 review feedback: Layout.init() was passed the
// #toc-headings element (the inner heading list) instead of the outer #toc
// panel (which also contains the file tree), a latent bug from PR #166
// (Lv2-7) that predates Issue #196/#197. Dragging #toc-divider only resized
// #toc-headings, leaving the outer #toc panel (and file tree) unchanged.

async function dragTocDivider(page, deltaX) {
  const divider = page.locator('#toc-divider');
  const box = await divider.boundingBox();
  if (!box) {
    throw new Error('toc-divider bounding box unavailable');
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY, { steps: 10 });
  await page.mouse.up();
}

test('dragging #toc-divider resizes the outer #toc panel, not just #toc-headings', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const initialTocWidth = await page.locator('#toc').evaluate(el => el.offsetWidth);

  await dragTocDivider(page, 100);

  const widenedTocWidth = await page.locator('#toc').evaluate(el => el.offsetWidth);
  expect(widenedTocWidth).toBeGreaterThan(initialTocWidth + 40);
});
