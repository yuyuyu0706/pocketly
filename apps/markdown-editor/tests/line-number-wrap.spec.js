const { test, expect } = require('@playwright/test');

const VIEWPORT = { width: 1280, height: 1024 };

async function enterEditMode(page) {
  await page.locator('#toggle-mode').click();
  await page.waitForTimeout(100);
}

async function enableLineNumbers(page) {
  const pressed = await page.locator('#toggle-line-numbers').getAttribute('aria-pressed');
  if (pressed !== 'true') {
    await page.locator('#toggle-line-numbers').click();
    await page.waitForTimeout(100);
  }
}

async function getLineNumberGutterInfo(page) {
  return page.evaluate(() => {
    const gutter = document.getElementById('line-number-gutter');
    if (!gutter) return null;
    const spans = Array.from(gutter.querySelectorAll('.line-number'));
    return {
      totalSpans: spans.length,
      continuationCount: gutter.querySelectorAll('.line-number-continuation').length,
      numberedCount: spans.filter(s => !s.classList.contains('line-number-continuation')).length,
      gutterScrollTop: gutter.scrollTop,
      gutterScrollHeight: gutter.scrollHeight,
    };
  });
}

test.describe('Line number gutter – wrapped line support', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await enterEditMode(page);
    await enableLineNumbers(page);
  });

  test('short document without wrapping: one numbered span per logical line', async ({ page }) => {
    const content = 'Line 1\nLine 2\nLine 3';
    await page.locator('#editor').fill(content);
    await page.waitForTimeout(200);

    const info = await getLineNumberGutterInfo(page);
    expect(info).not.toBeNull();
    expect(info.numberedCount).toBe(3);
    expect(info.continuationCount).toBe(0);
    expect(info.totalSpans).toBe(3);
  });

  test('document with empty lines: empty lines generate exactly one span each', async ({ page }) => {
    const content = 'Line 1\n\nLine 3\n\nLine 5';
    await page.locator('#editor').fill(content);
    await page.waitForTimeout(200);

    const info = await getLineNumberGutterInfo(page);
    expect(info).not.toBeNull();
    expect(info.numberedCount).toBe(5);
    expect(info.continuationCount).toBe(0);
  });

  test('wrapped line generates continuation spans', async ({ page }) => {
    // Set a very narrow editor width to force wrapping
    await page.evaluate(() => {
      const editor = document.getElementById('editor');
      editor.style.width = '120px';
      const pane = document.getElementById('editor-pane');
      if (pane) pane.style.width = '150px';
    });
    await page.waitForTimeout(100);

    // A long line that will definitely wrap at 120px
    const longLine = 'This is a very long line of text that should wrap in a narrow editor window and produce continuation spans in the gutter.';
    const content = `${longLine}\nShort line\n${longLine}`;
    await page.locator('#editor').fill(content);
    await page.waitForTimeout(200);

    const info = await getLineNumberGutterInfo(page);
    expect(info).not.toBeNull();
    // 3 logical lines → 3 numbered spans
    expect(info.numberedCount).toBe(3);
    // Wrapped lines → at least some continuation spans
    expect(info.continuationCount).toBeGreaterThan(0);
  });

  test('scroll sync: gutter scrollTop equals editor scrollTop', async ({ page }) => {
    // Build a 60-line document
    const lines = Array.from({ length: 60 }, (_, i) => `Line ${i + 1}`);
    await page.locator('#editor').fill(lines.join('\n'));
    await page.waitForTimeout(200);

    // Scroll the editor halfway
    await page.evaluate(() => {
      const editor = document.getElementById('editor');
      editor.scrollTop = editor.scrollHeight / 2;
      editor.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(100);

    const result = await page.evaluate(() => {
      const editor = document.getElementById('editor');
      const gutter = document.getElementById('line-number-gutter');
      return {
        editorScrollTop: editor.scrollTop,
        gutterScrollTop: gutter.scrollTop,
      };
    });
    expect(result.gutterScrollTop).toBe(result.editorScrollTop);
  });

  test('gutter recalculates after panel resize (width change)', async ({ page }) => {
    const longLine = 'Resize test: this line is long enough to potentially wrap when the editor width changes significantly.';
    await page.locator('#editor').fill(longLine);
    await page.waitForTimeout(200);

    const before = await getLineNumberGutterInfo(page);

    // Narrow the editor
    await page.evaluate(() => {
      const editor = document.getElementById('editor');
      const pane = document.getElementById('editor-pane');
      editor.style.width = '150px';
      if (pane) pane.style.width = '180px';
      // Trigger ResizeObserver
      editor.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(300);

    const after = await getLineNumberGutterInfo(page);
    // After narrowing, total spans should be >= before (more wrapping possible)
    expect(after.totalSpans).toBeGreaterThanOrEqual(before.totalSpans);
  });
});
