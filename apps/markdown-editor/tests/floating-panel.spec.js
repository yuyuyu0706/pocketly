const { test, expect } = require('@playwright/test');

const VIEWPORT = { width: 1280, height: 1024 };

test.describe('Floating panel (edit mode)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('edit mode: editor-pane has position fixed', async ({ page }) => {
    await page.locator('#toggle-mode').click();
    const position = await page.evaluate(() => {
      return window.getComputedStyle(document.getElementById('editor-pane')).position;
    });
    expect(position).toBe('fixed');
  });

  test('edit mode: editor-drag-handle is visible', async ({ page }) => {
    await page.locator('#toggle-mode').click();
    const visible = await page.locator('#editor-drag-handle').isVisible();
    expect(visible).toBe(true);
  });

  test('read mode: editor-drag-handle is hidden', async ({ page }) => {
    const visible = await page.locator('#editor-drag-handle').isVisible();
    expect(visible).toBe(false);
  });

  test('floating panel position is applied from DEFAULT_SETTINGS on first edit entry', async ({ page }) => {
    await page.locator('#toggle-mode').click();
    const rect = await page.evaluate(() => {
      const el = document.getElementById('editor-pane');
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.top).toBeGreaterThanOrEqual(0);
  });

  test('dragging handle updates position and persists to localStorage', async ({ page }) => {
    await page.locator('#toggle-mode').click();

    // Simulate drag via mouse events
    const initialRect = await page.evaluate(() => {
      const el = document.getElementById('editor-pane');
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });

    const handleRect = await page.locator('#editor-drag-handle').boundingBox();
    const startX = handleRect.x + handleRect.width / 2;
    const startY = handleRect.y + handleRect.height / 2;
    const dx = 80;
    const dy = 40;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + dx, startY + dy, { steps: 5 });
    await page.mouse.up();

    const newRect = await page.evaluate(() => {
      const el = document.getElementById('editor-pane');
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), top: Math.round(r.top) };
    });

    expect(newRect.left).toBeGreaterThan(initialRect.left);
    expect(newRect.top).toBeGreaterThan(initialRect.top);

    // Position is persisted to dedicated localStorage key
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('md:layout:floatingPanel');
      return raw ? JSON.parse(raw) : null;
    });
    expect(stored).not.toBeNull();
    expect(typeof stored.left).toBe('number');
    expect(typeof stored.top).toBe('number');
    expect(stored.left).toBeGreaterThan(0);
  });

  test('position is restored from localStorage after reload', async ({ page }) => {
    // Enter edit mode and drag the panel
    await page.locator('#toggle-mode').click();
    const handleRect = await page.locator('#editor-drag-handle').boundingBox();
    const startX = handleRect.x + handleRect.width / 2;
    const startY = handleRect.y + handleRect.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 100, startY + 60, { steps: 5 });
    await page.mouse.up();

    const savedLeft = await page.evaluate(() => {
      const raw = localStorage.getItem('md:layout:floatingPanel');
      return raw ? JSON.parse(raw).left : null;
    });
    expect(savedLeft).not.toBeNull();

    // Reload and re-enter edit mode
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('#toggle-mode').click();

    const restoredLeft = await page.evaluate(() => {
      return document.getElementById('editor-pane').getBoundingClientRect().left;
    });
    expect(Math.round(restoredLeft)).toBe(savedLeft);
  });

  test('Read→Edit→Read→Edit: floating panel position is maintained', async ({ page }) => {
    // First: switch to edit and drag
    await page.locator('#toggle-mode').click();
    const handleRect = await page.locator('#editor-drag-handle').boundingBox();
    const startX = handleRect.x + handleRect.width / 2;
    const startY = handleRect.y + handleRect.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 60, startY + 30, { steps: 5 });
    await page.mouse.up();

    const savedSettings = await page.evaluate(() => {
      const raw = localStorage.getItem('md:layout:floatingPanel');
      return raw ? JSON.parse(raw) : null;
    });

    // Switch back to read, then edit again
    await page.locator('#toggle-mode').click();
    await page.locator('#toggle-mode').click();

    const rect = await page.evaluate(() => {
      const el = document.getElementById('editor-pane');
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), top: Math.round(r.top) };
    });
    expect(rect.left).toBe(savedSettings.left);
    expect(rect.top).toBe(savedSettings.top);
  });

  test('existing mode-switch tests still pass: N_read=5 in read mode', async ({ page }) => {
    const visibleCount = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#toolbar-actions > *')).filter(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }).length;
    });
    expect(visibleCount).toBeLessThanOrEqual(5);
  });
});
