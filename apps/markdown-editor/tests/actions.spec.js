const { test, expect } = require('@playwright/test');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const fileUrl = 'file://' + path.resolve(__dirname, '../index.html');
const VIEWPORT = { width: 1280, height: 1024 };
const STORAGE_IGNORE_KEYS = [
  'md:text',
  'md:settings',
  'markdown-editor-language',
  'markdown-editor-language-source',
];

const MIN_EDITOR_WIDTH = 100;

async function getPaneMetrics(page) {
  return await page.evaluate(() => {
    const main = document.querySelector('main');
    const editor = document.getElementById('editor');
    const preview = document.getElementById('preview');
    const toc = document.getElementById('toc');
    const tocDivider = document.getElementById('toc-divider');
    const divider = document.getElementById('divider');
    if (!main || !editor || !preview || !divider) {
      throw new Error('Editor layout elements not found');
    }
    const styles = window.getComputedStyle(editor);
    const paddingLeft = parseFloat(styles.paddingLeft) || 0;
    const paddingRight = parseFloat(styles.paddingRight) || 0;
    const editorWidth = editor.offsetWidth;
    const previewWidth = preview.offsetWidth;
    const totalWidth = editorWidth + previewWidth;
    const rect = main.getBoundingClientRect();
    const tocWidth = toc ? toc.offsetWidth : 0;
    const tocDividerWidth = tocDivider ? tocDivider.offsetWidth : 0;
    const dividerWidth = divider.offsetWidth;
    const availableWidth =
      rect.width - tocWidth - tocDividerWidth - dividerWidth;
    return {
      editorWidth,
      previewWidth,
      totalWidth,
      availableWidth,
      editorPadding: paddingLeft + paddingRight,
      ratio:
        availableWidth > 0 ? editorWidth / availableWidth : 0,
    };
  });
}

function calculateExpectedEditorWidth(availableWidth, storedRatio, padding = 0) {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) {
    return null;
  }
  if (!Number.isFinite(storedRatio)) {
    return null;
  }
  const minWidth = MIN_EDITOR_WIDTH + padding;
  const maxWidth = Math.max(minWidth, availableWidth - minWidth);
  const minRatio = Math.min(minWidth / availableWidth, 1);
  const maxRatio = Math.max(minRatio, Math.min(maxWidth / availableWidth, 1));
  const safeRatio = Math.min(Math.max(storedRatio, minRatio), maxRatio);
  const desiredWidth = Math.round(safeRatio * availableWidth);
  const clampedWidth = Math.min(
    Math.max(desiredWidth, minWidth),
    maxWidth
  );
  return clampedWidth;
}

async function dragDivider(page, deltaX) {
  const divider = page.locator('#divider');
  const box = await divider.boundingBox();
  if (!box) {
    throw new Error('Divider bounding box unavailable');
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY, { steps: 10 });
  await page.mouse.up();
}

async function waitForPaneLayout(page) {
  await page.waitForFunction(() => {
    const editor = document.getElementById('editor');
    const preview = document.getElementById('preview');
    if (!editor || !preview) {
      return false;
    }
    return editor.offsetWidth > 0 && preview.offsetWidth > 0;
  });
}

async function getStorageSnapshot(page) {
  return await page.evaluate(() => {
    const snapshot = {};
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      snapshot[key] = window.localStorage.getItem(key);
    }
    return snapshot;
  });
}

async function waitForStorageChange(page, previousSnapshot, options = {}) {
  const { ignoreKeys = [], timeout = 5000, pollInterval = 50 } = options;
  const deadline = Date.now() + timeout;
  const previous = previousSnapshot ? { ...previousSnapshot } : {};

  while (Date.now() < deadline) {
    const snapshot = await getStorageSnapshot(page);
    const combinedKeys = new Set([
      ...Object.keys(previous),
      ...Object.keys(snapshot),
    ]);

    const changedKeys = [];
    for (const key of combinedKeys) {
      if (ignoreKeys.includes(key)) {
        continue;
      }
      if (snapshot[key] !== previous[key]) {
        changedKeys.push(key);
      }
    }

    if (changedKeys.length > 0) {
      const key = changedKeys[0];
      return {
        key,
        value: snapshot[key] ?? null,
        snapshot,
        changedKeys,
      };
    }

    await page.waitForTimeout(pollInterval);
  }

  throw new Error('Timed out waiting for localStorage change');
}

test('exports PDF via button', async ({ page }) => {
  await page.goto(fileUrl);
  await page.evaluate(() => {
    const originalOpen = window.open;
    window.open = (...args) => {
      const win = originalOpen(...args);
      win.print = () => {};
      win.close = () => {};
      return win;
    };
  });
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.click('#export-pdf'),
  ]);
  await expect(popup).toHaveTitle('Preview');
  await popup.close();
  expect(popup.isClosed()).toBeTruthy();
});

test('exports preview HTML via button', async ({ page }) => {
  await page.goto(fileUrl);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#export-html'),
  ]);
  const suggestedFilename = await download.suggestedFilename();
  expect(suggestedFilename).toMatch(/\.html$/);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'md-html-'));
  const targetPath = path.join(tempDir, suggestedFilename);
  await download.saveAs(targetPath);
  const html = await fs.readFile(targetPath, 'utf8');
  expect(html).toContain('<!DOCTYPE html>');
  expect(html).toContain('Welcome to Markdown Editor Blue');
  expect(html).toContain('<div id="preview"');
  expect(html).toMatch(/<style>[\s\S]*pre \{/);
});

test('inserts image into preview', async ({ page }) => {
  await page.goto(fileUrl);
  const buffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAE0lEQVR42mP8z/D/PwMDAwMAAAIABJACJ1gAAAAASUVORK5CYII=',
    'base64'
  );
  await page.setInputFiles('#imageInput', {
    name: 'test.png',
    mimeType: 'image/png',
    buffer,
  });
  await expect(page.locator('#editor')).toHaveValue(/\[Image: test.png\]/);
  await expect(page.locator('#preview img')).toHaveAttribute('src', /data:image\/png;base64/);
});

test('divider can move horizontally', async ({ page }) => {
  await page.goto(fileUrl);
  const editor = page.locator('#editor');
  const divider = page.locator('#divider');
  const initialWidth = await editor.evaluate(e => e.offsetWidth);
  const box = await divider.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 50, y);
  await page.mouse.up();
  const newWidth = await editor.evaluate(e => e.offsetWidth);
  expect(newWidth).not.toBe(initialWidth);
});

test('divider persists width ratio after reload', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto(fileUrl);
  await page.waitForLoadState('load');
  await page.evaluate(() => {
    try {
      window.localStorage && window.localStorage.clear();
      window.sessionStorage && window.sessionStorage.clear();
    } catch (error) {
      // Ignore storage access errors in non-standard environments.
    }
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#divider');
  await waitForPaneLayout(page);

  const initialMetrics = await getPaneMetrics(page);
  const initialStorage = await getStorageSnapshot(page);

  const moveRightBy = Math.min(
    220,
    Math.max(120, Math.floor(initialMetrics.previewWidth / 2))
  );
  await dragDivider(page, moveRightBy);

  const widenedMetrics = await getPaneMetrics(page);
  expect(widenedMetrics.editorWidth).toBeGreaterThan(
    initialMetrics.editorWidth + 40
  );
  expect(Math.abs(widenedMetrics.ratio - initialMetrics.ratio)).toBeGreaterThan(0.04);

  const firstPersist = await waitForStorageChange(page, initialStorage, {
    ignoreKeys: STORAGE_IGNORE_KEYS,
  });
  expect(firstPersist.changedKeys.length).toBeGreaterThanOrEqual(1);
  const ratioKey = firstPersist.key;
  const ratioValue = firstPersist.value;
  expect(typeof ratioKey).toBe('string');
  expect(ratioValue).not.toBeNull();
  const storedRatioAfterExpand = Number.parseFloat(ratioValue);
  expect(Number.isFinite(storedRatioAfterExpand)).toBe(true);

  await page.reload({ waitUntil: 'load' });
  await waitForPaneLayout(page);

  const reloadedMetrics = await getPaneMetrics(page);
  const expectedReloadedWidth = calculateExpectedEditorWidth(
    reloadedMetrics.availableWidth,
    storedRatioAfterExpand,
    reloadedMetrics.editorPadding
  );
  expect(expectedReloadedWidth).not.toBeNull();
  expect(
    Math.abs(reloadedMetrics.editorWidth - expectedReloadedWidth)
  ).toBeLessThanOrEqual(2);
  expect(Math.abs(reloadedMetrics.ratio - storedRatioAfterExpand)).toBeLessThanOrEqual(0.01);

  const storageAfterReload = await getStorageSnapshot(page);
  expect(storageAfterReload[ratioKey]).toBe(ratioValue);

  const moveLeftBy = -Math.min(
    220,
    Math.max(120, Math.floor(widenedMetrics.editorWidth / 2))
  );
  await dragDivider(page, moveLeftBy);

  const narrowedMetrics = await getPaneMetrics(page);
  expect(widenedMetrics.editorWidth - narrowedMetrics.editorWidth).toBeGreaterThan(40);
  expect(Math.abs(narrowedMetrics.ratio - widenedMetrics.ratio)).toBeGreaterThan(0.04);

  const secondPersist = await waitForStorageChange(page, storageAfterReload, {
    ignoreKeys: STORAGE_IGNORE_KEYS,
  });
  expect(secondPersist.changedKeys).toContain(ratioKey);
  expect(secondPersist.key).toBe(ratioKey);
  expect(secondPersist.value).not.toBeNull();
  expect(secondPersist.value).not.toBe(ratioValue);
  const storedRatioAfterContract = Number.parseFloat(secondPersist.value);
  expect(Number.isFinite(storedRatioAfterContract)).toBe(true);

  await page.reload({ waitUntil: 'load' });
  await waitForPaneLayout(page);

  const finalMetrics = await getPaneMetrics(page);
  const expectedFinalWidth = calculateExpectedEditorWidth(
    finalMetrics.availableWidth,
    storedRatioAfterContract,
    finalMetrics.editorPadding
  );
  expect(expectedFinalWidth).not.toBeNull();
  expect(Math.abs(finalMetrics.editorWidth - expectedFinalWidth)).toBeLessThanOrEqual(2);
  expect(Math.abs(finalMetrics.ratio - storedRatioAfterContract)).toBeLessThanOrEqual(0.01);

  const finalStorage = await getStorageSnapshot(page);
  expect(finalStorage[ratioKey]).toBe(secondPersist.value);
});

test('saves markdown to file', async ({ page }) => {
  await page.goto(fileUrl);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#save-md'),
  ]);
  expect(download.suggestedFilename()).toBe('document.md');
});

test('opens markdown file into editor', async ({ page }) => {
  await page.goto(fileUrl);
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('#open-md'),
  ]);
  await fileChooser.setFiles({
    name: 'opened.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# 開いたファイル', 'utf-8'),
  });
  await expect(page.locator('#editor')).toHaveValue('# 開いたファイル');
  await expect(page.locator('#preview h1')).toHaveText('開いたファイル');
});

test('renders mermaid diagram in preview', async ({ page }) => {
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.mermaid);
  await page.fill('#editor', '```mermaid\nflowchart LR\nA-->B\n```');
  await page.waitForSelector('#preview .mermaid svg');
  await expect(page.locator('#preview .mermaid svg')).toBeVisible();
});
