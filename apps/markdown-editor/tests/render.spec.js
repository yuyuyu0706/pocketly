const { test, expect } = require('@playwright/test');
const path = require('path');

const fileUrl = 'file://' + path.resolve(__dirname, '../index.html');

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
      // Ignore storage access errors in test environment.
    }
    window.__lastPreviewScrollTarget = null;
  });
  await page.goto(fileUrl);
  await page.addStyleTag({
    content: `html, body, #preview { scroll-behavior: auto !important; }`,
  });
});

test('startup shows Welcome and clears md:text (including empty/invisible values)', async ({
  page,
}) => {
  const preview = page.locator('#preview');
  const editor = page.locator('#editor');

  const expectWelcomeState = async () => {
    await expect(preview).toContainText('Welcome to Markdown Editor Blue');
    await expect(editor).toHaveValue(/Welcome to Markdown Editor Blue/);
    await page.waitForFunction(() => window.localStorage.getItem('md:text') === null);
  };

  await test.step('baseline startup renders Welcome and clears md:text', async () => {
    await expect(editor).toBeVisible();
    await expectWelcomeState();
  });

  const presetScenarios = [
    { description: 'empty string in storage', value: '' },
    { description: 'only invisible characters in storage', value: '\u200B\u200B\n\u200B' },
    {
      description: 'previously saved markdown in storage',
      value: '# Draft from last time\n\n- line 1\n- line 2',
    },
  ];

  for (const scenario of presetScenarios) {
    await test.step(`startup resets when ${scenario.description}`, async () => {
      await page.evaluate(value => {
        window.localStorage.setItem('md:text', value);
      }, scenario.value);

      await page.reload({ waitUntil: 'load' });
      await expectWelcomeState();

      await test.step('subsequent reload without editing keeps Welcome state', async () => {
        await page.reload({ waitUntil: 'load' });
        await expectWelcomeState();
      });

      const typedText = `Temporary editor input after ${scenario.description}`;
      await test.step('editing and reloading returns to Welcome and clears storage', async () => {
        await page.fill('#editor', typedText);
        await page.waitForFunction(
          expected => window.localStorage.getItem('md:text') === expected,
          typedText
        );

        await page.reload({ waitUntil: 'load' });
        await expectWelcomeState();
      });
    });
  }
});

test('reload resets to welcome note even after saving custom text', async ({ page }) => {
  const customText = 'Stored note across reload';
  await page.fill('#editor', customText);
  await page.waitForFunction(text => window.AppState.getText() === text, customText);
  await page.waitForTimeout(400);
  await page.waitForFunction(
    text => window.localStorage.getItem('md:text') === text,
    customText
  );

  await page.reload();

  await expect(page.locator('#preview')).toContainText('Welcome to Markdown Editor Blue');
  await expect(page.locator('#editor')).toHaveValue(/Welcome to Markdown Editor Blue/);
  await page.waitForFunction(() => window.localStorage.getItem('md:text') === null);
  await page.waitForFunction(() => window.localStorage.getItem('md:settings') === null);
});

test('ignores stored text that only contains invisible characters', async ({ page }) => {
  await page.evaluate(() => {
    window.localStorage.setItem('md:text', '\u200B\n\u200B');
  });

  await page.reload();

  await expect(page.locator('#preview')).toContainText('Welcome to Markdown Editor Blue');
  await expect(page.locator('#editor')).toHaveValue(/Welcome to Markdown Editor Blue/);
  await page.waitForFunction(() => window.localStorage.getItem('md:text') === null);
  await page.waitForFunction(() => window.localStorage.getItem('md:settings') === null);
});

test('clears stored text when reloading immediately after emptying editor', async ({ page }) => {
  await page.fill('#editor', 'Personal draft');
  await page.waitForFunction(() => window.AppState.getText() === 'Personal draft');
  await page.waitForTimeout(400);

  await page.fill('#editor', '');
  await page.waitForFunction(() => window.AppState.getText() === '');

  await page.reload();

  await expect(page.locator('#preview')).toContainText('Welcome to Markdown Editor Blue');
  await expect(page.locator('#editor')).toHaveValue(/Welcome to Markdown Editor Blue/);
  await page.waitForFunction(() => window.localStorage.getItem('md:text') === null);
  await page.waitForFunction(() => window.localStorage.getItem('md:settings') === null);
});

test('clears stored settings on reload', async ({ page }) => {
  await page.evaluate(() => {
    window.localStorage.setItem('md:settings', JSON.stringify({ lang: 'ja', extra: true }));
  });

  await page.reload();

  await expect(page.locator('#lang-switch')).toHaveValue('en');
  await page.waitForFunction(() => window.localStorage.getItem('md:settings') === null);
});

test('clears stored language preference on reload', async ({ page }) => {
  await page.evaluate(() => {
    window.localStorage.setItem('markdown-editor-language', 'ja');
    window.localStorage.setItem('markdown-editor-language-source', 'user');
  });

  await page.reload();

  await expect(page.locator('#lang-switch')).toHaveValue('en');
  await page.waitForFunction(
    () =>
      window.localStorage.getItem('markdown-editor-language') === null &&
      window.localStorage.getItem('markdown-editor-language-source') === null
  );
  await page.waitForFunction(() => window.localStorage.getItem('md:settings') === null);
});

test('initial language defaults to English', async ({ page }) => {
  await expect(page.locator('#lang-switch')).toHaveValue('en');
  await expect(page.locator('#open-md')).toHaveText('📂 Open');
  await expect(page.locator('#help-btn')).toHaveText('❔ Help');
});

test('open button loads selected markdown file', async ({ page }) => {
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('#open-md'),
  ]);

  await fileChooser.setFiles({
    name: 'render-open.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Render Test Open\n\n- item 1\n- item 2', 'utf-8'),
  });

  await expect(page.locator('#editor')).toHaveValue('# Render Test Open\n\n- item 1\n- item 2');
  await expect(page.locator('#preview h1')).toHaveText('Render Test Open');
  await expect(page.locator('#preview li')).toHaveCount(2);
});

test('language switch cycles English → Japanese → English', async ({ page }) => {
  const openButton = page.locator('#open-md');
  const helpButton = page.locator('#help-btn');

  await expect(openButton).toHaveText('📂 Open');
  await page.selectOption('#lang-switch', 'ja');
  await expect(openButton).toHaveText('📂 開く');
  await expect(helpButton).toHaveText('❔ ヘルプ');

  await page.selectOption('#lang-switch', 'en');
  await expect(openButton).toHaveText('📂 Open');
  await expect(helpButton).toHaveText('❔ Help');
});

test('preview checkbox interactions only update their markdown lines', async ({ page }) => {
  const editor = page.locator('#editor');

  const initialMarkdown = [
    '# Checkbox Sync Test',
    '',
    '- [ ] single unchecked',
    '',
    '## Multiple',
    '- [ ] multi alpha',
    '- [x] multi beta',
    '- [ ] multi gamma',
    '',
    '## Nested',
    '- [ ] parent task',
    '  - [ ] nested child',
    '  - [x] nested done',
    '- [ ] trailing outer',
    '',
    '## Japanese',
    '- [ ] 日本語のタスクA',
    '- [x] 日本語のタスクB',
  ].join('\n');

  const initialLines = initialMarkdown.split('\n');
  let currentLines = initialLines.slice();

  const previewCheckboxSelector = '#preview input[type="checkbox"]';
  const byTaskIndex = index =>
    page.locator(`${previewCheckboxSelector}[data-task-index="${index}"]`);

  const getEditorLines = async () => (await editor.inputValue()).split('\n');

  const focusEditor = async () => {
    await page.evaluate(() => {
      const editorEl = document.getElementById('editor');
      if (!editorEl) {
        return;
      }
      try {
        editorEl.focus({ preventScroll: true });
      } catch (error) {
        editorEl.focus();
      }
    });
  };

  const applyCheckboxState = (line, checked) => line.replace(/\[( |x|X)\]/, checked ? '[x]' : '[ ]');

  const defaultCaretColumnForLine = line => {
    const closingBracketIndex = line.indexOf(']');
    if (closingBracketIndex === -1) {
      return Math.min(line.length, 2);
    }
    return closingBracketIndex + 1;
  };

  const setCaretToLineColumn = async (lineIndex, columnOverride) => {
    const snapshot = currentLines.slice();
    const line = snapshot[lineIndex];
    const safeColumn = Math.min(Math.max(columnOverride, 0), line.length);
    await page.evaluate(({ lines, targetLineIndex, column }) => {
      const editorEl = document.getElementById('editor');
      if (!editorEl) {
        return;
      }
      let offset = 0;
      for (let i = 0; i < targetLineIndex; i += 1) {
        offset += lines[i].length + 1;
      }
      const target = offset + column;
      try {
        editorEl.focus({ preventScroll: true });
      } catch (error) {
        editorEl.focus();
      }
      editorEl.selectionStart = target;
      editorEl.selectionEnd = target;
    }, { lines: snapshot, targetLineIndex: lineIndex, column: safeColumn });
  };

  const getSelectionRange = async () =>
    page.evaluate(() => {
      const editorEl = document.getElementById('editor');
      if (!editorEl) {
        return null;
      }
      return {
        start: editorEl.selectionStart,
        end: editorEl.selectionEnd,
      };
    });

  const assertOnlyLineChanged = (beforeLines, afterLines, targetIndex, expectedLine) => {
    expect(afterLines.length).toBe(beforeLines.length);
    afterLines.forEach((line, idx) => {
      if (idx === targetIndex) {
        expect(line).toBe(expectedLine);
      } else {
        expect(line).toBe(beforeLines[idx]);
      }
    });
  };

  const selectionTolerance = 4;

  const toggleAndAssert = async ({ checkboxLocator, lineIndex, expectedLine, expectedChecked }) => {
    const caretColumn = defaultCaretColumnForLine(currentLines[lineIndex]);
    await setCaretToLineColumn(lineIndex, caretColumn);
    await focusEditor();
    const beforeSelection = await getSelectionRange();
    expect(beforeSelection).not.toBeNull();

    const beforeEditorLines = await getEditorLines();
    expect(beforeEditorLines).toEqual(currentLines);

    const previousLines = currentLines.slice();

    await checkboxLocator.click();

    const expectedLines = previousLines.slice();
    expectedLines[lineIndex] = expectedLine;
    const expectedText = expectedLines.join('\n');

    await page.waitForFunction(
      expected => window.AppState && window.AppState.getText() === expected,
      expectedText
    );

    await expect(checkboxLocator).toHaveJSProperty('checked', expectedChecked);

    const afterEditorLines = await getEditorLines();
    assertOnlyLineChanged(previousLines, afterEditorLines, lineIndex, expectedLine);

    await focusEditor();
    const afterSelection = await getSelectionRange();
    expect(afterSelection).not.toBeNull();
    expect(Math.abs(afterSelection.start - beforeSelection.start)).toBeLessThanOrEqual(
      selectionTolerance
    );
    expect(Math.abs(afterSelection.end - beforeSelection.end)).toBeLessThanOrEqual(
      selectionTolerance
    );

    currentLines = afterEditorLines;
  };

  const runRoundTrip = async ({ checkboxLocator, lineIndex }) => {
    const baseLine = currentLines[lineIndex];
    const checkedLine = applyCheckboxState(baseLine, true);
    const uncheckedLine = applyCheckboxState(baseLine, false);
    const initiallyChecked = /\[(x|X)\]/.test(baseLine);

    if (initiallyChecked) {
      await toggleAndAssert({
        checkboxLocator,
        lineIndex,
        expectedLine: uncheckedLine,
        expectedChecked: false,
      });
      await toggleAndAssert({
        checkboxLocator,
        lineIndex,
        expectedLine: checkedLine,
        expectedChecked: true,
      });
    } else {
      await toggleAndAssert({
        checkboxLocator,
        lineIndex,
        expectedLine: checkedLine,
        expectedChecked: true,
      });
      await toggleAndAssert({
        checkboxLocator,
        lineIndex,
        expectedLine: uncheckedLine,
        expectedChecked: false,
      });
    }
  };

  await test.step('initialize markdown with checklist scenarios', async () => {
    await editor.fill(initialMarkdown);
    await page.waitForFunction(
      expected => window.AppState && window.AppState.getText() === expected,
      initialMarkdown
    );

    await expect(editor).toHaveValue(initialMarkdown);
    await expect(page.locator(`${previewCheckboxSelector}[data-task-index]`)).toHaveCount(10);

    const lines = await getEditorLines();
    expect(lines).toEqual(currentLines);
  });

  await test.step('single checkbox toggles only its markdown line', async () => {
    await runRoundTrip({ checkboxLocator: byTaskIndex(0), lineIndex: 2 });
  });

  await test.step('multiple checkboxes toggle independently within the same list', async () => {
    await runRoundTrip({ checkboxLocator: byTaskIndex(1), lineIndex: 5 });
    await runRoundTrip({ checkboxLocator: byTaskIndex(2), lineIndex: 6 });
  });

  await test.step('nested checklist items toggle without affecting siblings', async () => {
    await runRoundTrip({ checkboxLocator: byTaskIndex(5), lineIndex: 11 });
  });

  await test.step('checkbox with Japanese label toggles correctly', async () => {
    const japaneseCheckbox = page
      .locator('#preview li', { hasText: '日本語のタスクA' })
      .locator('input[type="checkbox"]');
    await runRoundTrip({ checkboxLocator: japaneseCheckbox, lineIndex: 16 });
  });

  await test.step('final editor content matches the initial markdown', async () => {
    const finalLines = await getEditorLines();
    expect(finalLines).toEqual(initialLines);
    expect(currentLines).toEqual(initialLines);
  });
});

test('preview retains manual scroll position while editing', async ({ page }) => {
  const longMarkdown = ['# Scroll Test'];
  for (let i = 1; i <= 40; i += 1) {
    longMarkdown.push(`\n## Section ${i}\n\nContent paragraph ${i}.`);
  }
  await page.fill('#editor', longMarkdown.join('\n'));
  const preview = page.locator('#preview');

  await preview.waitFor();
  await page.evaluate(() => {
    const previewEl = document.getElementById('preview');
    previewEl.scrollTop = previewEl.scrollHeight;
    previewEl.dispatchEvent(new Event('wheel', { bubbles: true }));
  });

  const initialScrollTop = await preview.evaluate(el => el.scrollTop);

  await page.type('#editor', '\nNew line');

  const finalScrollTop = await preview.evaluate(el => el.scrollTop);
  expect(Math.abs(finalScrollTop - initialScrollTop)).toBeLessThan(10);
});

test(
  'table of contents navigation aligns heading under toolbar padding (±10px, reduced-motion)',
  async ({ page }) => {
    // The preview scroll logic aligns the clicked heading so that its top edge sits directly
    // under the toolbar plus the preview padding. Build a markdown document large enough so the
    // target heading starts well below the fold to avoid environment-specific font/line wrapping
    // affecting the initial viewport.
    const markdown = ['# TOC Test'];
    const sectionCount = 32;
    const targetIndex = 24;
    for (let i = 1; i <= sectionCount; i += 1) {
      markdown.push(
        `\n## Jump Section ${i}\n\n` +
          'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(10) +
          '\n\n' +
          'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. '.repeat(8) +
          '\n\n' +
          'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.'.repeat(4)
      );
    }
    await page.fill('#editor', markdown.join('\n'));

    const targetLabel = `Jump Section ${targetIndex}`;

    const targetSlugHandle = await page.waitForFunction(label => {
      const preview = document.getElementById('preview');
      if (!preview) {
        return null;
      }
      const heading = Array.from(preview.querySelectorAll('h2')).find(
        element => element.textContent && element.textContent.trim() === label
      );
      return heading ? heading.id : null;
    }, targetLabel);
    const targetSlug = await targetSlugHandle.jsonValue();

    expect(targetSlug).toBeTruthy();

    const tocItem = page.locator(`#toc .toc-item[data-target="${targetSlug}"]`).first();
    await expect(tocItem).toBeVisible();

    const tolerance = 10;
    const waitForAlignment = async () => {
      await page.evaluate(() => {
        window.__lastPreviewScrollTarget = null;
      });
      await tocItem.click();
      await page.waitForFunction(
        ({ slug, tolerance: tol }) => {
          const previewEl = document.getElementById('preview');
          const toolbar = document.getElementById('toolbar');
          const scrollInfo = window.__lastPreviewScrollTarget;
          if (!previewEl || !toolbar || !scrollInfo) {
            return false;
          }
          if (scrollInfo.id !== slug) {
            return false;
          }

          const heading = previewEl.querySelector(`#${slug}`);
          if (!heading) {
            return false;
          }

          const paddingTop = parseFloat(getComputedStyle(previewEl).paddingTop || '0') || 0;
          const expectedOffset = toolbar.offsetHeight + paddingTop;
          const previewRect = previewEl.getBoundingClientRect();
          const headingRect = heading.getBoundingClientRect();
          const relativeTop = headingRect.top - previewRect.top;

          return Math.abs(relativeTop - expectedOffset) <= tol;
        },
        { slug: targetSlug, tolerance: tolerance },
        { timeout: 12_000 }
      );
    };

    try {
      await waitForAlignment();
    } catch (error) {
      // If the event or geometry check fails once, retry the click exactly one more time to
      // capture potential missed events before surfacing the failure.
      await waitForAlignment();
    }

    const alignmentDelta = await page.evaluate(slug => {
      const previewEl = document.getElementById('preview');
      const toolbar = document.getElementById('toolbar');
      const heading = previewEl ? previewEl.querySelector(`#${slug}`) : null;
      const scrollInfo = window.__lastPreviewScrollTarget;
      if (!previewEl || !toolbar || !heading || !scrollInfo) {
        return null;
      }

      const paddingTop = parseFloat(getComputedStyle(previewEl).paddingTop || '0') || 0;
      const expectedOffset = toolbar.offsetHeight + paddingTop;
      const previewRect = previewEl.getBoundingClientRect();
      const headingRect = heading.getBoundingClientRect();
      const relativeTop = headingRect.top - previewRect.top;

      return {
        idMatch: scrollInfo.id === slug,
        delta: relativeTop - expectedOffset,
      };
    }, targetSlug);

    expect(alignmentDelta).not.toBeNull();
    expect(alignmentDelta.idMatch).toBe(true);
    expect(Math.abs(alignmentDelta.delta)).toBeLessThanOrEqual(tolerance);
  }
);

test('help window can be opened and closed', async ({ page }) => {
  const helpWindow = page.locator('#help-window');
  await expect(helpWindow).toBeHidden();

  await page.click('#help-btn');
  await expect(helpWindow).toBeVisible();

  await page.click('#help-close');
  await expect(helpWindow).toBeHidden();
});

test('template menu opens and lists templates', async ({ page }) => {
  const templateMenu = page.locator('#template-options');
  await expect(templateMenu).toBeHidden();

  await page.click('#template-btn');
  await expect(templateMenu).toBeVisible();
  await expect(templateMenu.locator('.template-option')).toHaveCount(5);
});
