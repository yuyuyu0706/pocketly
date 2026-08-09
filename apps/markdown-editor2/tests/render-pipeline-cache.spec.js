const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.click('#toggle-mode');
});

test.describe('Render pipeline: editor-input debounce (Issue #158)', () => {
  test('rapid editor keystrokes trigger only one Preview.render call within the debounce window', async ({
    page
  }) => {
    await page.evaluate(() => {
      window.__renderCallCount = 0;
      const original = window.Preview.render;
      window.Preview.render = function (...args) {
        window.__renderCallCount += 1;
        return original.apply(this, args);
      };
    });

    const editor = page.locator('#editor');
    await editor.click();
    await editor.fill('');
    await page.keyboard.type('hello', { delay: 20 });

    // Still within the debounce window: no render should have fired yet.
    expect(await page.evaluate(() => window.__renderCallCount)).toBe(0);

    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__renderCallCount)).toBe(1);
  });

  test('non-editor source (document switch) renders immediately without debounce', async ({ page }) => {
    await page.evaluate(() => {
      window.__renderCallCount = 0;
      const original = window.Preview.render;
      window.Preview.render = function (...args) {
        window.__renderCallCount += 1;
        return original.apply(this, args);
      };
    });

    await page.evaluate(() => {
      const id = window.AppState.openDocument('# Second doc');
      window.AppState.switchActiveDocument(id);
    });

    expect(await page.evaluate(() => window.__renderCallCount)).toBe(1);
  });
});

test.describe('Render pipeline: render() result cache (Issue #158)', () => {
  test('re-rendering the same text for the same document skips mermaid re-execution', async ({ page }) => {
    await page.waitForFunction(() => window.mermaid);
    const text = '```mermaid\nflowchart LR\nA-->B\n```';
    await page.fill('#editor', text);
    await page.waitForSelector('#preview .mermaid svg');

    await page.evaluate(() => {
      window.__mermaidRunCallCount = 0;
      const original = window.mermaid.run;
      window.mermaid.run = function (...args) {
        window.__mermaidRunCallCount += 1;
        return original.apply(this, args);
      };
    });

    await page.evaluate(text => window.Preview.render(text), text);

    expect(await page.evaluate(() => window.__mermaidRunCallCount)).toBe(0);
  });

  test('changed text for the same document bypasses the cache and re-renders', async ({ page }) => {
    await page.waitForFunction(() => window.mermaid);
    const first = '```mermaid\nflowchart LR\nA-->B\n```';
    await page.fill('#editor', first);
    await page.waitForSelector('#preview .mermaid svg');

    await page.evaluate(() => {
      window.__mermaidRunCallCount = 0;
      const original = window.mermaid.run;
      window.mermaid.run = function (...args) {
        window.__mermaidRunCallCount += 1;
        return original.apply(this, args);
      };
    });

    const second = '```mermaid\nflowchart LR\nA-->C\n```';
    await page.evaluate(text => window.Preview.render(text), second);

    expect(await page.evaluate(() => window.__mermaidRunCallCount)).toBe(1);
  });

  test('switching back to a cached document restores content without re-parsing', async ({ page }) => {
    const firstText = '# Doc A\nContent A';
    await page.fill('#editor', firstText);
    await expect(page.locator('#preview')).toContainText('Doc A');

    const secondId = await page.evaluate(() => {
      const id = window.AppState.openDocument('# Doc B\nContent B');
      window.AppState.switchActiveDocument(id);
      return id;
    });
    await expect(page.locator('#preview')).toContainText('Doc B');

    const firstId = await page.evaluate(
      secondDocId =>
        window.AppState.listDocuments()
          .map(d => d.id)
          .find(id => id !== secondDocId),
      secondId
    );

    await page.evaluate(id => window.AppState.switchActiveDocument(id), firstId);
    await expect(page.locator('#preview')).toContainText('Doc A');
  });
});
