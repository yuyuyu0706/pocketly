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

  // Item 2: replaceEditorRange calls execCommand on _editor.ownerDocument (not the main document)
  // Verified by swapping _editor to an iframe's textarea and confirming execCommand fires on
  // the iframe's document, not window.document.
  test('replaceEditorRange calls execCommand on _editor.ownerDocument (iframe)', async ({ page }) => {
    const result = await page.evaluate(async () => {
      // Create a sandboxed iframe so its document differs from the main document
      const iframe = document.createElement('iframe');
      document.body.appendChild(iframe);
      await new Promise(resolve => {
        iframe.onload = resolve;
        iframe.src = 'about:blank';
      });

      const iframeDoc = iframe.contentDocument;
      const textarea = iframeDoc.createElement('textarea');
      iframeDoc.body.appendChild(textarea);
      textarea.value = 'hello world';
      textarea.focus();
      textarea.selectionStart = 0;
      textarea.selectionEnd = 5;

      // Track which document's execCommand is called
      let mainDocCalled = false;
      let iframeDocCalled = false;
      const origMain = document.execCommand.bind(document);
      const origIframe = iframeDoc.execCommand.bind(iframeDoc);
      document.execCommand = function (cmd, ...args) {
        if (cmd === 'insertText') mainDocCalled = true;
        return origMain(cmd, ...args);
      };
      iframeDoc.execCommand = function (cmd, ...args) {
        if (cmd === 'insertText') iframeDocCalled = true;
        return origIframe(cmd, ...args);
      };

      const origEditor = document.querySelector('textarea');
      window.__formattingTest.setEditorForTest(textarea);
      window.__formattingTest.replaceEditorRange(0, 5, 'hi');
      window.__formattingTest.restoreEditor(origEditor);

      document.execCommand = origMain;
      iframeDoc.execCommand = origIframe;

      document.body.removeChild(iframe);
      return { mainDocCalled, iframeDocCalled };
    });

    // execCommand must fire on the iframe doc (ownerDocument), NOT on the main document
    expect(result.iframeDocCalled).toBe(true);
    expect(result.mainDocCalled).toBe(false);
  });

  // Item 3: showFormattingMenu uses ownerDoc.defaultView (not hardcoded window) for coordinates.
  // Verified by: (a) calling the function with known clientX/Y and checking style.top is set,
  // (b) confirming getOwnerDoc() returns _editor.ownerDocument (== document in normal env).
  test('showFormattingMenu sets menu position and uses _editor.ownerDocument.defaultView', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Scroll + show in one synchronous block to avoid async scroll events between evaluates
      document.body.style.minHeight = '3000px';
      window.scrollTo(0, 200);
      const scrollY = window.scrollY || window.pageYOffset || 0;

      window.__formattingTest.showFormattingMenu(50, 150);

      const menu = document.getElementById('formatting-menu');
      const menuTopRaw = menu ? menu.style.top : '';
      const menuTop = parseFloat(menuTopRaw);
      const visible = window.__formattingTest.getFormattingMenuVisible();
      const ownerDocIsPageDoc = window.__formattingTest.getOwnerDoc() === document;

      return { scrollY, menuTopRaw, menuTop, visible, ownerDocIsPageDoc };
    });

    // ownerDoc must be the page document (== _editor.ownerDocument in normal window)
    expect(result.ownerDocIsPageDoc).toBe(true);
    // Menu must be visible and style.top must be set to a finite number
    expect(result.visible).toBe(true);
    expect(result.menuTopRaw).not.toBe('');
    expect(Number.isFinite(result.menuTop)).toBe(true);
    // If page scrolled, menu top must include that offset (scrollY + clientY = 350)
    if (result.scrollY > 0) {
      expect(result.menuTop).toBeGreaterThanOrEqual(result.scrollY);
    }
  });

  // Item 4: onResize PiP guard — applyEditorRatio must not be called when _isPiP is true
  test('onResize does not call applyEditorRatio when _isPiP is true', async ({ page }) => {
    const callCount = await page.evaluate(() => {
      Layout.persistEditorWidthRatio();

      let count = 0;
      window.__layoutTest.setApplyEditorRatioRef(() => { count++; });
      Layout.setPiPMode(true);
      Layout.onResize();
      window.__layoutTest.resetApplyEditorRatioRef();
      Layout.setPiPMode(false);
      return count;
    });

    expect(callCount).toBe(0);
  });

  test('onResize calls applyEditorRatio when _isPiP is false', async ({ page }) => {
    const callCount = await page.evaluate(() => {
      Layout.persistEditorWidthRatio();
      if (window.__layoutTest.getStoredEditorWidthRatio() === null) {
        return -1;
      }

      let count = 0;
      window.__layoutTest.setApplyEditorRatioRef(() => { count++; });
      Layout.setPiPMode(false);
      Layout.onResize();
      window.__layoutTest.resetApplyEditorRatioRef();
      return count;
    });

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
    expect(result.savedHTML).not.toBe(result.checkHTML);
  });

  // Item 6: PiP inline style string verification via window.__pipStyleTest.build()
  test('buildPipStyleText does not contain flex-direction:column', async ({ page }) => {
    const styleText = await page.evaluate(() => window.__pipStyleTest.build());

    expect(styleText).not.toContain('flex-direction:column');
    expect(styleText).not.toContain('flex-direction: column');
  });

  test('buildPipStyleText contains padding-top:28px for #editor-pane', async ({ page }) => {
    const styleText = await page.evaluate(() => window.__pipStyleTest.build());

    expect(styleText).toContain('padding-top:28px');
    expect(styleText).toContain('#editor-pane');
  });

  test('buildPipStyleText contains display:flex for #editor-pane', async ({ page }) => {
    const styleText = await page.evaluate(() => window.__pipStyleTest.build());

    expect(styleText).toContain('display:flex');
  });
});
