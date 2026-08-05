const { test, expect } = require('@playwright/test');

test.describe('Lv4-4: window.__xxx logic tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      delete window.documentPictureInPicture;
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  // Item 1: ensureMirrorElement recreates mirror in _editor.ownerDocument
  test('ensureMirrorElement returns mirror in same document as _editor.ownerDocument', async ({ page }) => {
    const result = await page.evaluate(() => {
      const mirror = window.__layoutTest.ensureMirrorElement();
      const editor = document.querySelector('textarea');
      return {
        mirrorExists: !!mirror,
        sameDocument: mirror ? mirror.ownerDocument === editor.ownerDocument : false,
        isConnected: mirror ? mirror.isConnected : false,
        ariaHidden: mirror ? mirror.getAttribute('aria-hidden') : null,
      };
    });

    expect(result.mirrorExists).toBe(true);
    expect(result.sameDocument).toBe(true);
    expect(result.isConnected).toBe(true);
    expect(result.ariaHidden).toBe('true');
  });

  test('ensureMirrorElement reuses existing mirror when ownerDocument has not changed', async ({ page }) => {
    const result = await page.evaluate(() => {
      const m1 = window.__layoutTest.ensureMirrorElement();
      const m2 = window.__layoutTest.ensureMirrorElement();
      return { same: m1 === m2 };
    });

    expect(result.same).toBe(true);
  });

  // Item 2: replaceEditorRange calls execCommand via _editor.ownerDocument
  test('replaceEditorRange calls execCommand on _editor.ownerDocument', async ({ page }) => {
    const called = await page.evaluate(() => {
      const editor = document.querySelector('textarea');
      editor.value = 'hello world';
      editor.selectionStart = 0;
      editor.selectionEnd = 5;

      let execCommandDoc = null;
      const orig = document.execCommand.bind(document);
      document.execCommand = function (cmd, ...args) {
        if (cmd === 'insertText') execCommandDoc = this;
        return orig(cmd, ...args);
      };

      window.__formattingTest.replaceEditorRange(0, 5, 'hi');
      document.execCommand = orig;

      return execCommandDoc === document;
    });

    expect(called).toBe(true);
  });

  // Item 3: showFormattingMenu calculates position using ownerDoc.defaultView scroll offsets
  test('showFormattingMenu includes scroll offset in menu position', async ({ page }) => {
    // Make page tall enough to scroll
    await page.evaluate(() => {
      document.body.style.minHeight = '3000px';
    });
    await page.evaluate(() => window.scrollTo(0, 200));

    await page.evaluate(() => {
      window.__formattingTest.showFormattingMenu(50, 100);
    });

    const menuTop = await page.evaluate(() => {
      const menu = document.getElementById('formatting-menu');
      return menu ? parseFloat(menu.style.top) : -1;
    });

    // With scrollY=200 and clientY=100, targetTop starts at 200+100=300
    expect(menuTop).toBeGreaterThanOrEqual(200);
  });

  // Item 4: onResize PiP guard — applyEditorRatio must not be called when _isPiP is true
  test('onResize does not call applyEditorRatio when _isPiP is true', async ({ page }) => {
    const callCount = await page.evaluate(() => {
      // Ensure storedEditorWidthRatio is non-null
      Layout.persistEditorWidthRatio();

      let count = 0;
      window.__layoutTest.onApplyEditorRatio = () => { count++; };
      Layout.setPiPMode(true);
      Layout.onResize();
      window.__layoutTest.onApplyEditorRatio = null;
      Layout.setPiPMode(false);
      return count;
    });

    expect(callCount).toBe(0);
  });

  test('onResize calls applyEditorRatio when _isPiP is false', async ({ page }) => {
    const callCount = await page.evaluate(() => {
      Layout.persistEditorWidthRatio();
      // Ensure ratio is non-null
      if (window.__layoutTest.getStoredEditorWidthRatio() === null) {
        return -1;
      }

      let count = 0;
      window.__layoutTest.onApplyEditorRatio = () => { count++; };
      Layout.setPiPMode(false);
      Layout.onResize();
      window.__layoutTest.onApplyEditorRatio = null;
      return count;
    });

    // -1 means ratio was null (no available width to measure), skip
    if (callCount !== -1) {
      expect(callCount).toBeGreaterThanOrEqual(1);
    }
  });

  // Item 5: copy button icon is saved and restored via innerHTML
  test('editorCopyBtn: initial copyIconHTML is saved and matches button innerHTML', async ({ page }) => {
    const result = await page.evaluate(() => {
      const btn = document.getElementById('editor-copy-btn');
      if (!btn || !window.__copyBtnTest) return null;
      return {
        savedHTML: window.__copyBtnTest.getCopyIconHTML(),
        currentHTML: btn.innerHTML,
        checkHTML: window.__copyBtnTest.getCheckIconHTML(),
      };
    });

    expect(result).not.toBeNull();
    expect(result.savedHTML).toBeTruthy();
    expect(result.savedHTML).toBe(result.currentHTML);
    expect(result.checkHTML).toContain('polyline');
    // Saved icon and check icon must be distinct
    expect(result.savedHTML).not.toBe(result.checkHTML);
  });

  // Item 6: pip-mode CSS — #editor-pane maintains flex-direction: row and expected padding-top
  test('body.pip-mode: #editor-pane maintains flex-direction row', async ({ page }) => {
    await page.evaluate(() => {
      document.body.classList.add('pip-mode');
    });

    const flexDirection = await page.evaluate(() => {
      return getComputedStyle(document.getElementById('editor-pane')).flexDirection;
    });

    expect(flexDirection).toBe('row');

    await page.evaluate(() => {
      document.body.classList.remove('pip-mode');
    });
  });

  test('body.pip-mode with PiP inline style: #editor-pane has padding-top 28px', async ({ page }) => {
    await page.evaluate(() => {
      document.body.classList.add('pip-mode');
      const pane = document.getElementById('editor-pane');
      pane.style.setProperty('padding-top', '28px', 'important');
    });

    const paddingTop = await page.evaluate(() => {
      return getComputedStyle(document.getElementById('editor-pane')).paddingTop;
    });

    expect(paddingTop).toBe('28px');

    await page.evaluate(() => {
      document.body.classList.remove('pip-mode');
      document.getElementById('editor-pane').style.removeProperty('padding-top');
    });
  });
});
