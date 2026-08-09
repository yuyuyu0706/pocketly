const { test, expect } = require('@playwright/test');

test.describe('AppState persistence (Issue #161)', () => {
  test.beforeEach(async ({ page }) => {
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
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('multi-document text, cursor, and active document are restored after reload', async ({ page }) => {
    await page.evaluate(() => {
      window.AppState.init({ text: 'first doc' });
      window.AppState.setCursor({ start: 2, end: 5, direction: 'f' });
      const secondId = window.AppState.openDocument('second doc');
      window.AppState.switchActiveDocument(secondId);
      window.AppState.setCursor({ start: 1, end: 1, direction: 'b' });
      window.__lastSecondId = secondId;
    });

    await page.waitForTimeout(400);

    const secondId = await page.evaluate(() => window.__lastSecondId);
    await page.reload();
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(() => ({
      docCount: window.__stateTest.getDocumentCount(),
      activeId: window.AppState.getActiveDocumentId(),
      activeText: window.AppState.getText(),
      activeCursor: window.AppState.getCursor()
    }));

    expect(result.docCount).toBe(2);
    expect(result.activeId).toBe(secondId);
    expect(result.activeText).toBe('second doc');
    expect(result.activeCursor).toEqual({ start: 1, end: 1, direction: 'b' });
  });

  test('settings persist across reload (regression for state.js init bug)', async ({ page }) => {
    await page.evaluate(() => {
      window.AppState.init({});
      window.AppState.setSetting('showLineNumbers', true);
      window.AppState.setSetting('lang', 'ja');
    });

    await page.waitForFunction(() => window.localStorage.getItem('md:settings') !== null);

    await page.reload();
    await page.waitForLoadState('networkidle');

    const settings = await page.evaluate(() => window.AppState.getSettings());

    expect(settings.showLineNumbers).toBe(true);
    expect(settings.lang).toBe('ja');
  });

  test('folder-derived documents (meta.path) are excluded from persistence', async ({ page }) => {
    await page.evaluate(() => {
      window.AppState.init({ text: 'regular doc' });
      window.AppState.setCursor({ start: 2, end: 2, direction: 'f' });
      window.AppState.openDocument('folder doc', { path: '/some/folder/file.md' });
    });

    await page.waitForTimeout(400);

    const stored = await page.evaluate(() => window.sessionStorage.getItem('md:documents'));
    const parsed = JSON.parse(stored);

    expect(parsed.documents.length).toBe(1);
    expect(parsed.documents[0].text).toBe('regular doc');

    await page.reload();
    await page.waitForLoadState('networkidle');

    const docCount = await page.evaluate(() => window.__stateTest.getDocumentCount());
    expect(docCount).toBe(1);
  });

  test('invalid md:documents data falls back to single-document mode without crashing', async ({ page }) => {
    await page.evaluate(() => {
      window.sessionStorage.setItem('md:documents', '{not valid json');
      window.sessionStorage.setItem('md:text', 'fallback text');
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(() => ({
      docCount: window.__stateTest.getDocumentCount(),
      text: window.AppState.getText()
    }));

    expect(result.docCount).toBe(1);
    expect(result.text).toBe('fallback text');
  });
});
