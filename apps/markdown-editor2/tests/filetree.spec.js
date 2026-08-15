const { test, expect } = require('@playwright/test');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

// Mirrors tests/directory-import.spec.js's fixture-folder pattern (Issue #171 /
// MEW-035 Lv4-2): Directory now imports via <input type="file" webkitdirectory>,
// so tests inject real files through page.setInputFiles()/filechooser instead of
// mocking window.showDirectoryPicker().
//
// Layout:
//   index.md
//   b.md
//   notes/
//     other.md
//     index.md
//   zeta/
//     z.md
async function buildFixtureFolder() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-filetree-'));
  const folder = path.join(root, 'my-folder');
  await fs.mkdir(path.join(folder, 'notes'), { recursive: true });
  await fs.mkdir(path.join(folder, 'zeta'), { recursive: true });

  await fs.writeFile(path.join(folder, 'index.md'), '# Root index');
  await fs.writeFile(path.join(folder, 'b.md'), '# B');
  await fs.writeFile(path.join(folder, 'notes', 'other.md'), '# Other');
  await fs.writeFile(path.join(folder, 'notes', 'index.md'), '# Notes index');
  await fs.writeFile(path.join(folder, 'zeta', 'z.md'), '# Z');

  return folder;
}

test.describe('File tree (Issue #165 / MEW-011)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('file tree is hidden before a folder is imported', async ({ page }) => {
    const fileTree = page.locator('#file-tree');
    await expect(fileTree).toHaveClass(/hidden/);
    await expect(page.locator('#toc-headings')).toBeVisible();
  });

  test('clicking "Open Folder" in the toolbar imports files and reveals the tree', async ({ page }) => {
    const folder = await buildFixtureFolder();

    await page.click('#open-btn');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('#open-folder');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(folder);

    await page.waitForFunction(() => window.AppState.listDocuments().length >= 4);

    const fileTree = page.locator('#file-tree');
    await expect(fileTree).not.toHaveClass(/hidden/);
    await expect(fileTree.locator('.file-tree-file', { hasText: 'b.md' })).toBeVisible();
  });

  test('importing a folder renders a nested tree', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 4);

    const fileTree = page.locator('#file-tree');
    await expect(fileTree).not.toHaveClass(/hidden/);

    const notesFolder = fileTree.locator('.file-tree-folder', { hasText: 'notes' });
    await expect(notesFolder).toBeVisible();
    await expect(notesFolder.locator('.file-tree-file', { hasText: 'other.md' })).toBeVisible();
    await expect(notesFolder.locator('.file-tree-file', { hasText: 'index.md' })).toBeVisible();
  });

  test('index.md is promoted to the top of its level', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 4);

    const fileTree = page.locator('#file-tree');
    const rootNames = await fileTree
      .locator(':scope > .file-tree-list > .file-tree-item > .file-tree-row > .file-tree-label')
      .allTextContents();

    const fileNamesOnly = rootNames.filter(name => name === 'index.md' || name === 'b.md');
    expect(fileNamesOnly).toEqual(['index.md', 'b.md']);
  });

  test('folders sort before files, both alphabetically', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 4);

    const fileTree = page.locator('#file-tree');
    const rootNames = await fileTree
      .locator(':scope > .file-tree-list > .file-tree-item > .file-tree-row > .file-tree-label')
      .allTextContents();

    expect(rootNames).toEqual(['notes', 'zeta', 'index.md', 'b.md']);
  });

  test('file tree labels have pointer-events enabled so clicks are receivable (Issue #185)', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 4);

    const pointerEvents = await page.evaluate(() => {
      const label = document.querySelector('.file-tree-label');
      return label ? getComputedStyle(label).pointerEvents : null;
    });
    expect(pointerEvents).toBe('auto');
  });

  test('clicking a file activates the document and highlights it', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 4);

    const fileTree = page.locator('#file-tree');
    await fileTree.locator('.file-tree-file', { hasText: 'b.md' }).locator('.file-tree-label').click();

    await expect(page.locator('#editor')).toHaveValue('# B');
    await expect(fileTree.locator('.file-tree-file.active')).toContainText('b.md');
  });

  test('clicking a folder toggles it open/closed without switching documents', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 4);

    const editorBefore = await page.locator('#editor').inputValue();
    const fileTree = page.locator('#file-tree');
    const zetaFolder = fileTree.locator('.file-tree-folder', { hasText: 'zeta' });

    await expect(zetaFolder).toHaveClass(/open/);
    await expect(zetaFolder.locator('.file-tree-file', { hasText: 'z.md' })).toBeVisible();

    await zetaFolder.locator(':scope > .file-tree-row > .file-tree-label').click();
    await expect(zetaFolder).not.toHaveClass(/open/);
    await expect(zetaFolder.locator('.file-tree-file', { hasText: 'z.md' })).toBeHidden();

    // The editor content must not have changed just from toggling the folder.
    await expect(page.locator('#editor')).toHaveValue(editorBefore);
  });

  test('reload restores the tree via Directory.restoreOnStartup()', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 4);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 4);

    const fileTree = page.locator('#file-tree');
    await expect(fileTree).not.toHaveClass(/hidden/);
    await expect(fileTree.locator('.file-tree-file', { hasText: 'b.md' })).toBeVisible();
    await expect(fileTree.locator('.file-tree-folder', { hasText: 'notes' })).toBeVisible();
  });

  test('does not regress the existing heading TOC when no folder is imported', async ({ page }) => {
    await page.fill('#editor', '# Heading A\n\nBody text.\n\n## Heading B\n');
    await page.dispatchEvent('#editor', 'input');

    const tocHeadings = page.locator('#toc-headings');
    await expect(tocHeadings.locator('.toc-item')).toHaveCount(2);
    await expect(page.locator('#file-tree')).toHaveClass(/hidden/);
  });
});
