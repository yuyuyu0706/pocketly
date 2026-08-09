const { test, expect } = require('@playwright/test');

test.describe('AppState document collection model (Issue #151)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('single-document usage: getText/setText behave as before (backward compatibility)', async ({ page }) => {
    const result = await page.evaluate(() => {
      window.AppState.init({ text: 'hello world' });
      const before = window.AppState.getText();
      window.AppState.setText('hello there');
      const after = window.AppState.getText();
      return { before, after, docCount: window.__stateTest.getDocumentCount() };
    });

    expect(result.before).toBe('hello world');
    expect(result.after).toBe('hello there');
    expect(result.docCount).toBe(1);
  });

  test('openDocument adds a document reflected in listDocuments without switching', async ({ page }) => {
    const result = await page.evaluate(() => {
      window.AppState.init({ text: 'first doc' });
      const activeBefore = window.AppState.getActiveDocumentId();
      const newId = window.AppState.openDocument('second doc', { name: 'second.md' });
      const list = window.AppState.listDocuments();
      const activeAfter = window.AppState.getActiveDocumentId();
      return { activeBefore, activeAfter, newId, list, activeText: window.AppState.getText() };
    });

    expect(result.list.map(d => d.id)).toContain(result.newId);
    expect(result.list.length).toBe(2);
    expect(result.activeAfter).toBe(result.activeBefore);
    expect(result.activeText).toBe('first doc');
  });

  test('switchActiveDocument changes getText() return value and emits text:changed', async ({ page }) => {
    const result = await page.evaluate(() => {
      window.AppState.init({ text: 'first doc' });
      const firstId = window.AppState.getActiveDocumentId();
      const secondId = window.AppState.openDocument('second doc');

      let lastEvent = null;
      Bus.on('text:changed', payload => {
        lastEvent = payload;
      });

      window.AppState.switchActiveDocument(secondId);
      const textAfterSwitch = window.AppState.getText();
      const activeAfterSwitch = window.AppState.getActiveDocumentId();

      window.AppState.switchActiveDocument(firstId);
      const textAfterSwitchBack = window.AppState.getText();

      return { textAfterSwitch, activeAfterSwitch, secondId, textAfterSwitchBack, lastEvent };
    });

    expect(result.textAfterSwitch).toBe('second doc');
    expect(result.activeAfterSwitch).toBe(result.secondId);
    expect(result.textAfterSwitchBack).toBe('first doc');
    expect(result.lastEvent).toEqual({ text: 'first doc', source: 'switch' });
  });

  test('closeDocument on a non-active document leaves the active document unchanged', async ({ page }) => {
    const result = await page.evaluate(() => {
      window.AppState.init({ text: 'first doc' });
      const firstId = window.AppState.getActiveDocumentId();
      const secondId = window.AppState.openDocument('second doc');

      window.AppState.closeDocument(secondId);

      return {
        activeId: window.AppState.getActiveDocumentId(),
        firstId,
        text: window.AppState.getText(),
        docCount: window.__stateTest.getDocumentCount()
      };
    });

    expect(result.activeId).toBe(result.firstId);
    expect(result.text).toBe('first doc');
    expect(result.docCount).toBe(1);
  });

  test('closeDocument on the active document falls back to the most recently active remaining document', async ({ page }) => {
    const result = await page.evaluate(() => {
      window.AppState.init({ text: 'first doc' });
      const firstId = window.AppState.getActiveDocumentId();
      const secondId = window.AppState.openDocument('second doc');
      const thirdId = window.AppState.openDocument('third doc');

      // Visit second, then third, then back to second, so second is most-recently-active.
      window.AppState.switchActiveDocument(secondId);
      window.AppState.switchActiveDocument(thirdId);
      window.AppState.switchActiveDocument(secondId);

      // Close the active document (second). Expect fallback to third (last visited before second).
      window.AppState.closeDocument(secondId);

      return {
        activeId: window.AppState.getActiveDocumentId(),
        thirdId,
        firstId,
        text: window.AppState.getText()
      };
    });

    expect(result.activeId).toBe(result.thirdId);
    expect(result.text).toBe('third doc');
  });

  test('closeDocument on the only remaining document auto-creates a fresh empty document', async ({ page }) => {
    const result = await page.evaluate(() => {
      window.AppState.init({ text: 'only doc' });
      const onlyId = window.AppState.getActiveDocumentId();

      window.AppState.closeDocument(onlyId);

      return {
        activeId: window.AppState.getActiveDocumentId(),
        onlyId,
        text: window.AppState.getText(),
        docCount: window.__stateTest.getDocumentCount()
      };
    });

    expect(result.activeId).not.toBe(result.onlyId);
    expect(result.activeId).not.toBeNull();
    expect(result.text).toBe('');
    expect(result.docCount).toBe(1);
  });

  test('getCursor/setCursor operate on the active document and are preserved on switch back', async ({ page }) => {
    const result = await page.evaluate(() => {
      window.AppState.init({ text: 'first doc' });
      const firstId = window.AppState.getActiveDocumentId();
      window.AppState.setCursor({ start: 3, end: 7, direction: 'f' });

      const secondId = window.AppState.openDocument('second doc');
      window.AppState.switchActiveDocument(secondId);
      const cursorOnSecond = window.AppState.getCursor();

      window.AppState.switchActiveDocument(firstId);
      const cursorBackOnFirst = window.AppState.getCursor();

      return { cursorOnSecond, cursorBackOnFirst };
    });

    expect(result.cursorOnSecond).toEqual({ start: 0, end: 0, direction: 'f' });
    expect(result.cursorBackOnFirst).toEqual({ start: 3, end: 7, direction: 'f' });
  });
});
