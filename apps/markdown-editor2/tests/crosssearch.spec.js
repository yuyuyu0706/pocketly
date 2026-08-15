const { test, expect } = require('@playwright/test');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

// Mirrors tests/quickswitcher.spec.js's fixture-folder pattern (Issue #191 /
// MEW-013), extended for Issue #193 / MEW-014.
async function buildFixtureFolder() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-crosssearch-'));
  const folder = path.join(root, 'my-folder');
  await fs.mkdir(folder, { recursive: true });

  await fs.writeFile(path.join(folder, 'a.md'), 'This document mentions banana fruit in the intro.');
  await fs.writeFile(path.join(folder, 'b.md'), 'Another document also talks about banana bread recipes.');
  await fs.writeFile(path.join(folder, 'c.md'), 'No relevant fruit content here at all.');

  return folder;
}

// Fixture folder for the performance test: 50+ small Markdown documents, one
// of which contains the search keyword.
async function buildLargeFixtureFolder(count) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-crosssearch-perf-'));
  const folder = path.join(root, 'my-folder');
  await fs.mkdir(folder, { recursive: true });

  for (let i = 0; i < count; i += 1) {
    const content = i === count - 1
      ? `# Document ${i}\n\nThis one contains the needle keyword somewhere in the middle of a longer paragraph of filler text repeated a few times to pad it out realistically.`
      : `# Document ${i}\n\n` + 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(20);
    await fs.writeFile(path.join(folder, `doc-${i}.md`), content);
  }

  return folder;
}

test.describe('Cross-document search (Issue #193 / MEW-014)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Ctrl+Shift+F opens the modal', async ({ page }) => {
    await expect(page.locator('#crosssearch')).toHaveCount(0);

    await page.keyboard.press('Control+Shift+F');

    await expect(page.locator('#crosssearch')).not.toHaveClass(/hidden/);
  });

  test('searching a keyword present in multiple documents returns results from both, with context snippets', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.Directory.getTree().length >= 3);

    await page.keyboard.press('Control+Shift+F');
    await expect(page.locator('#crosssearch')).not.toHaveClass(/hidden/);

    await page.fill('#crosssearch-input', 'banana');
    // Debounced at 200ms (Issue #193 spec); wait past it.
    await page.waitForTimeout(300);

    const items = page.locator('.crosssearch-item');
    await expect(items).toHaveCount(2);
    await expect(items.filter({ hasText: 'a.md' })).toBeVisible();
    await expect(items.filter({ hasText: 'b.md' })).toBeVisible();

    // Snippets contain context around the match, truncated with an ellipsis.
    const snippet = items.filter({ hasText: 'a.md' }).locator('.crosssearch-item-snippet');
    await expect(snippet).toContainText('banana');
    await expect(snippet.locator('mark')).toHaveText(/banana/i);
  });

  test('clicking a result activates the correct document via Directory.activateDocument', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.Directory.getTree().length >= 3);

    await page.keyboard.press('Control+Shift+F');
    await page.fill('#crosssearch-input', 'banana bread');
    await page.waitForTimeout(300);

    const item = page.locator('.crosssearch-item', { hasText: 'b.md' });
    await expect(item).toBeVisible();
    await item.click();

    await expect(page.locator('#crosssearch')).toHaveClass(/hidden/);
    await expect(page.locator('#editor')).toHaveValue(/banana bread/);
  });

  test('ArrowUp/ArrowDown move selection, Enter confirms, Escape closes', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.Directory.getTree().length >= 3);

    await page.keyboard.press('Control+Shift+F');
    await page.fill('#crosssearch-input', 'banana');
    await page.waitForTimeout(300);

    const items = page.locator('.crosssearch-item');
    await expect(items).toHaveCount(2);

    await page.keyboard.press('ArrowDown');
    await expect(items.nth(1)).toHaveClass(/selected/);
    await page.keyboard.press('ArrowUp');
    await expect(items.nth(0)).toHaveClass(/selected/);

    await page.keyboard.press('Escape');
    await expect(page.locator('#crosssearch')).toHaveClass(/hidden/);
  });

  test('Welcome document (not in fileRegistry) is included in results when it contains the query', async ({ page }) => {
    const activeText = await page.evaluate(() => window.AppState.getText());
    const word = activeText.trim().split(/\s+/).find(token => token.length > 3);
    test.skip(!word, 'Welcome document text has no usable search token');

    await page.keyboard.press('Control+Shift+F');
    await page.fill('#crosssearch-input', word);
    await page.waitForTimeout(300);

    const items = page.locator('.crosssearch-item');
    await expect(items.first()).toBeVisible();
  });

  test('performance: search over 50+ documents completes within 1 second', async ({ page }) => {
    const folder = await buildLargeFixtureFolder(55);
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.Directory.getTree().length >= 55);

    // Bypass the UI debounce and measure searchAllDocuments() directly, as
    // the issue spec asks for the search response time itself.
    const elapsedMs = await page.evaluate(() => {
      const start = performance.now();
      window.CrossSearch.searchAllDocuments('needle');
      return performance.now() - start;
    });

    // Measured on CI-equivalent hardware: consistently well under 1000ms for
    // 55 documents (~1-3ms typical, see console log below). No optimization
    // (e.g. lowercased-text caching) was needed; a full inverted index
    // remains out of scope per the issue spec.
    console.log(`[crosssearch perf] 55 documents, search "needle": ${elapsedMs.toFixed(2)}ms`);
    expect(elapsedMs).toBeLessThan(1000);
  });

  test('selecting a result selects the matched text in the editor and scrolls the preview to it (Issue #193 §2-4-1)', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.Directory.getTree().length >= 3);

    // Editor/preview split (edit mode) is required for the editor pane to be
    // visible/focusable at all; body[data-mode="read"] hides #editor-pane.
    if (await page.evaluate(() => document.body.dataset.mode !== 'edit')) {
      await page.click('#toggle-mode');
    }

    await page.keyboard.press('Control+Shift+F');
    await page.fill('#crosssearch-input', 'banana bread');
    await page.waitForTimeout(300);

    const item = page.locator('.crosssearch-item', { hasText: 'b.md' });
    await expect(item).toBeVisible();
    await item.click();

    await expect(page.locator('#crosssearch')).toHaveClass(/hidden/);

    // Editor: the selection must be exactly the matched text, and the
    // editor must hold focus (so the browser's own auto-scroll-to-selection
    // behaviour applies).
    const selection = await page.evaluate(() => {
      const editor = document.getElementById('editor');
      return {
        text: editor.value.slice(editor.selectionStart, editor.selectionEnd),
        focused: document.activeElement === editor
      };
    });
    expect(selection.text.toLowerCase()).toBe('banana bread');
    expect(selection.focused).toBe(true);

    // Preview: scrolled so the matched element is within the visible
    // viewport bounds of the preview pane.
    const inView = await page.evaluate(() => {
      const previewEl = document.querySelector('#preview');
      const previewRect = previewEl.getBoundingClientRect();
      const walker = document.createTreeWalker(previewEl, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent.toLowerCase().includes('banana bread')) {
          const rect = node.parentElement.getBoundingClientRect();
          return rect.top >= previewRect.top - 1 && rect.bottom <= previewRect.bottom + 1;
        }
      }
      return false;
    });
    expect(inView).toBe(true);
  });

  test('when a document has multiple matches, the jump targets only the first/topmost occurrence', async ({ page }) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-crosssearch-multi-'));
    const folder = path.join(root, 'my-folder');
    await fs.mkdir(folder, { recursive: true });
    // Second "needle" occurrence is far below the first, past the preview fold.
    const filler = 'Filler paragraph text that pads out the document. '.repeat(80);
    await fs.writeFile(
      path.join(folder, 'multi.md'),
      `First needle occurs right here at the top.\n\n${filler}\n\nSecond needle occurs way down here at the bottom.`
    );

    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.Directory.getTree().length >= 1);

    if (await page.evaluate(() => document.body.dataset.mode !== 'edit')) {
      await page.click('#toggle-mode');
    }

    await page.keyboard.press('Control+Shift+F');
    await page.fill('#crosssearch-input', 'needle');
    await page.waitForTimeout(300);

    const item = page.locator('.crosssearch-item', { hasText: 'multi.md' });
    await expect(item).toBeVisible();
    await item.click();

    const editorSelectionStart = await page.evaluate(() => document.getElementById('editor').selectionStart);
    const fullText = await page.evaluate(() => document.getElementById('editor').value);
    const firstIndex = fullText.toLowerCase().indexOf('needle');
    const secondIndex = fullText.toLowerCase().indexOf('needle', firstIndex + 1);
    expect(editorSelectionStart).toBe(firstIndex);
    expect(editorSelectionStart).toBeLessThan(secondIndex);
  });

  test('clicking #shortcuts-btn shows the Ctrl+Shift+F entry', async ({ page }) => {
    await page.click('#shortcuts-btn');
    const shortcutsWindow = page.locator('#shortcuts-window');
    await expect(shortcutsWindow).not.toHaveClass(/hidden/);
    await expect(shortcutsWindow).toContainText('Shift');
    await expect(shortcutsWindow).toContainText('F');
  });

  test('Ctrl+Shift+F opens the modal even while the editor textarea has focus', async ({ page }) => {
    if (await page.evaluate(() => document.body.dataset.mode !== 'edit')) {
      await page.click('#toggle-mode');
    }
    await page.click('#editor');
    await expect(page.locator('#editor')).toBeFocused();

    await page.keyboard.press('Control+Shift+F');

    await expect(page.locator('#crosssearch')).not.toHaveClass(/hidden/);
  });

  test('jumping to a result highlights only the matched substring, then removes it after its own (longer) duration', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.Directory.getTree().length >= 3);

    if (await page.evaluate(() => document.body.dataset.mode !== 'edit')) {
      await page.click('#toggle-mode');
    }

    await page.keyboard.press('Control+Shift+F');
    await page.fill('#crosssearch-input', 'banana');
    await page.waitForTimeout(300);
    await page.click('.crosssearch-item');

    // String-level highlight (Issue #193 round-3 fix 1): a <mark> wraps
    // only the matched substring, not the whole line/element.
    const mark = page.locator('#preview mark.crosssearch-flash');
    await expect(mark).toHaveCount(1, { timeout: 1000 });
    await expect(mark).toHaveText(/^banana$/i);
    // The parent element (the line/block) itself must NOT get the
    // whole-element heading-flash class -- this is a separate highlight
    // mechanism scoped to the match text only.
    await expect(page.locator('#preview .preview-heading-flash')).toHaveCount(0);

    // Duration constant is independent of HEADING_FLASH_DURATION (used by
    // TOC heading-jump highlighting) -- confirm the two differ, and that
    // the mark survives past HEADING_FLASH_DURATION before eventually
    // clearing on its own (SEARCH_MATCH_FLASH_DURATION).
    const durations = await page.evaluate(() => ({
      heading: window.__previewTest.HEADING_FLASH_DURATION,
      searchMatch: window.__previewTest.SEARCH_MATCH_FLASH_DURATION
    }));
    expect(durations.searchMatch).not.toBe(durations.heading);
    expect(durations.searchMatch).toBeGreaterThan(durations.heading);

    await page.waitForTimeout(durations.heading + 200);
    await expect(mark).toHaveCount(1);

    await expect(mark).toHaveCount(0, { timeout: durations.searchMatch });
  });

  test('DOM stays clean after a highlight is removed: a later search still finds and highlights matches correctly', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.Directory.getTree().length >= 3);

    if (await page.evaluate(() => document.body.dataset.mode !== 'edit')) {
      await page.click('#toggle-mode');
    }

    await page.keyboard.press('Control+Shift+F');
    await page.fill('#crosssearch-input', 'banana');
    await page.waitForTimeout(300);
    await page.click('.crosssearch-item');
    await expect(page.locator('#preview mark.crosssearch-flash')).toHaveCount(1, { timeout: 1000 });

    // Force-clear the highlight (equivalent to it timing out) via the
    // exposed unwrap helper, then assert the previously-wrapped text node
    // is intact (no stray empty text nodes, single merged text node) and a
    // fresh search+jump on the SAME document still finds+wraps the match.
    await page.evaluate(() => window.Preview.clearSearchMatchHighlight());
    await expect(page.locator('#preview mark.crosssearch-flash')).toHaveCount(0);

    const found = await page.evaluate(() => window.Preview.scrollToTextMatch('banana'));
    expect(found).toBe(true);
    await expect(page.locator('#preview mark.crosssearch-flash')).toHaveCount(1);
    await expect(page.locator('#preview mark.crosssearch-flash')).toHaveText(/^banana$/i);
  });

  test('jumping to a result updates the TOC active-heading highlight (Issue #193 follow-up)', async ({ page }) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-crosssearch-toc-'));
    const folder = path.join(root, 'my-folder');
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(
      path.join(folder, 'doc.md'),
      '# First\n\nintro text\n\n# Second\n\nbananapatch is here\n\n# Third\n\nmore text'
    );

    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.Directory.getTree().length >= 1);
    if (await page.evaluate(() => document.body.dataset.mode !== 'edit')) {
      await page.click('#toggle-mode');
    }

    await page.keyboard.press('Control+Shift+F');
    await page.fill('#crosssearch-input', 'bananapatch');
    await page.waitForTimeout(300);
    await page.click('.crosssearch-item');
    await page.waitForTimeout(200);

    const activeText = await page.evaluate(() => {
      const active = document.querySelector('.toc-item.active');
      return active ? active.textContent.trim() : null;
    });
    expect(activeText).toBe('Second');
  });

  test("jumping to a match far down a long document scrolls the editor to it (setSelectionRange alone doesn't auto-scroll a textarea)", async ({ page }) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-crosssearch-scroll-'));
    const folder = path.join(root, 'my-folder');
    await fs.mkdir(folder, { recursive: true });
    const filler = 'Lorem ipsum dolor sit amet. '.repeat(400);
    await fs.writeFile(path.join(folder, 'a.md'), `${filler}\n\nNEEDLEWORD\n\n${filler}`);

    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.Directory.getTree().length >= 1);
    if (await page.evaluate(() => document.body.dataset.mode !== 'edit')) {
      await page.click('#toggle-mode');
    }

    await page.keyboard.press('Control+Shift+F');
    await page.fill('#crosssearch-input', 'NEEDLEWORD');
    await page.waitForTimeout(300);
    await page.click('.crosssearch-item');
    await page.waitForTimeout(300);

    const scrollTop = await page.evaluate(() => document.getElementById('editor').scrollTop);
    expect(scrollTop).toBeGreaterThan(0);
  });

  test('Quick Switcher "?" prefix opens cross-search with the remaining text as the initial query (Issue #193 round-3 fallback)', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.Directory.getTree().length >= 3);

    await page.keyboard.press('Control+p');
    await expect(page.locator('#quickswitcher')).not.toHaveClass(/hidden/);

    await page.fill('#quickswitcher-input', '?banana');

    // Quick switcher closes, cross-search opens with results already shown
    // (no debounce wait needed for the fallback path).
    await expect(page.locator('#quickswitcher')).toHaveClass(/hidden/);
    await expect(page.locator('#crosssearch')).not.toHaveClass(/hidden/);
    await expect(page.locator('#crosssearch-input')).toHaveValue('banana');

    const items = page.locator('.crosssearch-item');
    await expect(items).toHaveCount(2);
  });
});
