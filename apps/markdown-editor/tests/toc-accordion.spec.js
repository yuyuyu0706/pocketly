const { test, expect } = require('@playwright/test');

const ACCORDION_MD = [
  '# Heading 1',
  '',
  '## Heading 2',
  '',
  '### Heading 3A',
  '',
  '#### Heading 4A-1',
  '',
  '#### Heading 4A-2',
  '',
  '### Heading 3B',
  '',
  '#### Heading 4B-1',
  '',
  '##### Heading 5B-1',
  '',
].join('\n');

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
      // ignore
    }
  });
  await page.goto('/');
  await page.click('#toggle-mode');
});

async function setEditorContent(page, text) {
  await page.evaluate(content => {
    const editor = document.getElementById('editor');
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    ).set;
    nativeInputValueSetter.call(editor, content);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
  await page.waitForTimeout(300);
}

test('level 1-3 items are always visible, level 4+ are hidden by default', async ({ page }) => {
  await setEditorContent(page, ACCORDION_MD);

  const item3A = page.locator('#toc .toc-item[data-level="3"]').first();
  await expect(item3A).toBeVisible();

  const item4 = page.locator('#toc .toc-item[data-level="4"]').first();
  await expect(item4).not.toBeVisible();
});

test('clicking level 3 expands its children (level 4+)', async ({ page }) => {
  await setEditorContent(page, ACCORDION_MD);

  const item3A = page.locator('#toc .toc-item[data-level="3"]').first();
  const item4A1 = page.locator('#toc .toc-item[data-level="4"]').first();

  await expect(item4A1).not.toBeVisible();
  await item3A.locator('> .toc-label').click();
  await expect(item4A1).toBeVisible();
});

test('accordion: clicking another level 3 closes the first and opens the new one', async ({ page }) => {
  await setEditorContent(page, ACCORDION_MD);

  const item3A = page.locator('#toc .toc-item[data-level="3"]').first();
  const item3B = page.locator('#toc .toc-item[data-level="3"]').nth(1);
  const item4A1 = page.locator('#toc .toc-item[data-level="4"]').first();
  const item4B1 = page.locator('#toc .toc-item[data-level="4"]').nth(2);

  await item3A.locator('> .toc-label').click();
  await expect(item4A1).toBeVisible();

  await item3B.locator('> .toc-label').click();
  await expect(item4A1).not.toBeVisible();
  await expect(item4B1).toBeVisible();
});

test('toggle: re-clicking expanded level 3 closes it', async ({ page }) => {
  await setEditorContent(page, ACCORDION_MD);

  const item3A = page.locator('#toc .toc-item[data-level="3"]').first();
  const item4A1 = page.locator('#toc .toc-item[data-level="4"]').first();

  await item3A.locator('> .toc-label').click();
  await expect(item4A1).toBeVisible();

  await item3A.locator('> .toc-label').click();
  await expect(item4A1).not.toBeVisible();
});

test('toc:jump navigation still works when clicking level 3 item', async ({ page }) => {
  await setEditorContent(page, ACCORDION_MD);

  const jumpEvents = [];
  await page.exposeFunction('__recordJump', id => jumpEvents.push(id));
  await page.evaluate(() => {
    if (window.Bus && typeof window.Bus.on === 'function') {
      window.Bus.on('toc:jump', e => window.__recordJump(e.id));
    }
  });

  const item3A = page.locator('#toc .toc-item[data-level="3"]').first();
  const targetId = await item3A.getAttribute('data-target');
  await item3A.locator('> .toc-label').click();

  await page.waitForTimeout(100);
  expect(jumpEvents).toContain(targetId);
});

test('active-ancestor class applied to level 3 when level 4+ is active', async ({ page }) => {
  await setEditorContent(page, ACCORDION_MD);

  const item3A = page.locator('#toc .toc-item[data-level="3"]').first();
  const item4A1 = page.locator('#toc .toc-item[data-level="4"]').first();
  const targetId = await item4A1.getAttribute('data-target');

  await item3A.locator('> .toc-label').click();
  await page.waitForTimeout(100);

  await page.evaluate(id => {
    window.Bus && window.Bus.emit('toc:jump', { id });
  }, targetId);
  await page.waitForTimeout(100);

  await expect(item3A).toHaveClass(/active-ancestor/);
});

test('active-ancestor not applied when level 1-3 is active', async ({ page }) => {
  await setEditorContent(page, ACCORDION_MD);

  const item3A = page.locator('#toc .toc-item[data-level="3"]').first();
  const targetId = await item3A.getAttribute('data-target');

  await page.evaluate(id => {
    window.Bus && window.Bus.emit('toc:jump', { id });
  }, targetId);
  await page.waitForTimeout(100);

  await expect(item3A).not.toHaveClass(/active-ancestor/);
});

test('level 5 headings are excluded from the TOC tree', async ({ page }) => {
  await setEditorContent(page, ACCORDION_MD);

  const level5Items = page.locator('#toc .toc-item[data-level="5"]');
  await expect(level5Items).toHaveCount(0);
});

test('fold state does not change when scrolling (active highlight changes without auto-open)', async ({ page }) => {
  await setEditorContent(page, ACCORDION_MD);

  const item3A = page.locator('#toc .toc-item[data-level="3"]').first();
  const item4A1 = page.locator('#toc .toc-item[data-level="4"]').first();

  // Initially closed
  await expect(item4A1).not.toBeVisible();

  // Simulate a highlight update without user clicking level 3
  const h4Id = await item4A1.getAttribute('data-target');
  await page.evaluate(id => {
    window.Bus && window.Bus.emit('toc:jump', { id });
  }, h4Id);
  await page.waitForTimeout(100);

  // Level 4 item should still be hidden (no auto-expand from highlight)
  await expect(item4A1).not.toBeVisible();
});
