const { test, expect } = require('@playwright/test');

const VIEWPORT = { width: 1280, height: 1024 };

test.describe('Mode switch', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('default mode is read: body has data-mode="read"', async ({ page }) => {
    const mode = await page.evaluate(() => document.body.dataset.mode);
    expect(mode).toBe('read');
  });

  test('default mode is read: editor-pane is hidden', async ({ page }) => {
    const visible = await page.locator('#editor-pane').isVisible();
    expect(visible).toBe(false);
  });

  test('default mode is read: divider is hidden', async ({ page }) => {
    const visible = await page.locator('#divider').isVisible();
    expect(visible).toBe(false);
  });

  test('clicking toggle-mode switches to edit: editor-pane becomes visible', async ({ page }) => {
    await page.locator('#toggle-mode').click();
    const visible = await page.locator('#editor-pane').isVisible();
    expect(visible).toBe(true);
  });

  test('clicking toggle-mode twice returns to read: editor-pane hidden again', async ({ page }) => {
    await page.locator('#toggle-mode').click();
    await page.locator('#toggle-mode').click();
    const visible = await page.locator('#editor-pane').isVisible();
    expect(visible).toBe(false);
  });

  test('read mode: edit-only buttons are hidden', async ({ page }) => {
    const saveMdVisible = await page.locator('#save-md').isVisible();
    expect(saveMdVisible).toBe(false);
  });

  test('edit mode: edit-only buttons become visible', async ({ page }) => {
    await page.locator('#toggle-mode').click();
    const saveMdVisible = await page.locator('#save-md').isVisible();
    expect(saveMdVisible).toBe(true);
  });

  test('read mode: visible toolbar items are 6 or fewer (N_read=6)', async ({ page }) => {
    const visibleCount = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#toolbar-actions > *')).filter(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }).length;
    });
    expect(visibleCount).toBeLessThanOrEqual(6);
  });

  test('mode is persisted in localStorage after switching to edit', async ({ page }) => {
    await page.locator('#toggle-mode').click();
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('md:settings');
      return raw ? JSON.parse(raw).mode : null;
    });
    expect(stored).toBe('edit');
  });

  test('read mode: clicking a TOC heading makes that TOC item active', async ({ page }) => {
    const md = '## Alpha\n\ntext\n\n## Beta\n\ntext';
    await page.evaluate(text => {
      const editor = document.getElementById('editor');
      editor.value = text;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }, md);

    await page.waitForSelector('#toc .toc-item');

    const betaItem = page.locator('#toc .toc-item[data-target="beta"]');
    await betaItem.click();

    await expect(betaItem).toHaveClass(/active/);
  });

  test('TOC gap click does not trigger toc:jump', async ({ page }) => {
    const md = '## Parent\n\ntext\n\n### Child\n\nmore text';
    await page.evaluate(text => {
      const editor = document.getElementById('editor');
      editor.value = text;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }, md);
    await page.waitForSelector('#toc .toc-item');

    // Intercept toc:jump events via Bus
    await page.evaluate(() => {
      window.__tocJumpCount = 0;
      const origOn = window.Bus && window.Bus.on.bind(window.Bus);
      // Patch via event interception on the toc ul gap area
      window.__tocJumpCount = 0;
    });

    // Track jump events by patching Bus before the click
    await page.evaluate(() => {
      window.__tocJumpFired = false;
      const orig = window.Bus.emit.bind(window.Bus);
      window.Bus.emit = (name, ...args) => {
        if (name === 'toc:jump') window.__tocJumpFired = true;
        return orig(name, ...args);
      };
    });

    // Click the ul element itself (left-padding gap area) by targeting the #toc ul directly
    await page.evaluate(() => {
      const ul = document.querySelector('#toc ul');
      if (ul) ul.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    const fired = await page.evaluate(() => window.__tocJumpFired);
    expect(fired).toBe(false);
  });

  test('Read→Edit→Read TOC jump→Edit: TOC retains the jumped heading on Edit re-entry', async ({ page }) => {
    const md = '## Alpha\n\ntext\n\n## Beta\n\nmore text\n\n## Gamma\n\neven more';

    // ① Start in Read mode — inject markdown
    await page.evaluate(text => {
      const editor = document.getElementById('editor');
      editor.value = text;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }, md);
    await page.waitForSelector('#toc .toc-item');

    // ② Switch to Edit so selectionStart gets set to some position
    await page.locator('#toggle-mode').click();
    await page.locator('#editor').click();

    // ③ Switch back to Read and click a TOC heading (Gamma)
    await page.locator('#toggle-mode').click();
    const gammaItem = page.locator('#toc .toc-item[data-target="gamma"]');
    await gammaItem.click();
    await expect(gammaItem).toHaveClass(/active/);

    // ④ Switch back to Edit — TOC must still show Gamma as active
    await page.locator('#toggle-mode').click();
    await expect(gammaItem).toHaveClass(/active/);
  });
});
