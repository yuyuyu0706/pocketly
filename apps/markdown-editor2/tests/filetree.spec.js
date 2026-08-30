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

// A folder <li> nests its children's markup as DOM descendants, so `hasText`
// substring matching against the <li> itself also matches any ancestor
// folder whose full text happens to contain the same substring -- notably
// the root "my-folder" node that now wraps every imported file (Issue #227).
// Matching the folder's own label exactly and walking up to its immediate
// parent <li> avoids the ambiguity (mirrors tests/fileexplorer.spec.js).
function folderLocator(fileTree, name) {
  return fileTree
    .locator('.file-tree-folder > .file-tree-row > .file-tree-label', {
      hasText: new RegExp(`^${name}$`)
    })
    .locator('xpath=ancestor::li[contains(concat(" ", normalize-space(@class), " "), " file-tree-folder ")][1]');
}

test.describe('File tree (Issue #165 / MEW-011)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Issue #210: startup now always seeds+persists welcome.md, so importFolder()
    // always finds an existing workspace and asks for confirmation before replacing it.
    await page.evaluate(() => {
      window.confirm = () => true;
    });
  });

  test('file tree shows the seeded welcome.md before any folder is imported (Issue #210)', async ({ page }) => {
    const fileTree = page.locator('#file-tree');
    await expect(fileTree).not.toHaveClass(/hidden/);
    await expect(fileTree.locator('.file-tree-file', { hasText: 'welcome.md' })).toBeVisible();
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

    const notesFolder = folderLocator(fileTree, 'notes');
    await expect(notesFolder).toBeVisible();
    await expect(notesFolder.locator('.file-tree-file', { hasText: 'other.md' })).toBeVisible();
    await expect(notesFolder.locator('.file-tree-file', { hasText: 'index.md' })).toBeVisible();
  });

  test('importing a folder shows the selected folder name as the single top-level node (Issue #227)', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 4);

    const fileTree = page.locator('#file-tree');
    const rootNames = await fileTree
      .locator(':scope > .file-tree-list > .file-tree-item > .file-tree-row > .file-tree-label')
      .allTextContents();

    expect(rootNames).toEqual(['my-folder']);
  });

  test('index.md is promoted to the top of its level', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 4);

    const fileTree = page.locator('#file-tree');
    const rootFolder = fileTree.locator('.file-tree-folder', { hasText: 'my-folder' }).first();
    const childNames = await rootFolder
      .locator(':scope > .file-tree-list > .file-tree-item > .file-tree-row > .file-tree-label')
      .allTextContents();

    const fileNamesOnly = childNames.filter(name => name === 'index.md' || name === 'b.md');
    expect(fileNamesOnly).toEqual(['index.md', 'b.md']);
  });

  test('folders sort before files, both alphabetically', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 4);

    const fileTree = page.locator('#file-tree');
    const rootFolder = fileTree.locator('.file-tree-folder', { hasText: 'my-folder' }).first();
    const childNames = await rootFolder
      .locator(':scope > .file-tree-list > .file-tree-item > .file-tree-row > .file-tree-label')
      .allTextContents();

    expect(childNames).toEqual(['notes', 'zeta', 'index.md', 'b.md']);
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
    const zetaFolder = folderLocator(fileTree, 'zeta');

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
    await expect(folderLocator(fileTree, 'notes')).toBeVisible();
  });

  test('does not regress the existing heading TOC when no folder is imported', async ({ page }) => {
    // Issue #210: welcome.md is now the seeded active document and opens in
    // read/preview mode, so the editor textarea must be switched to first.
    await page.click('#toggle-mode');
    await page.fill('#editor', '# Heading A\n\nBody text.\n\n## Heading B\n');
    await page.dispatchEvent('#editor', 'input');

    const tocHeadings = page.locator('#toc-headings');
    await expect(tocHeadings.locator('.toc-item')).toHaveCount(2);
    // Issue #210: the file tree is never hidden anymore (welcome.md keeps it
    // non-empty), but it coexists with the heading TOC without regressing it.
    await expect(page.locator('#file-tree')).not.toHaveClass(/hidden/);
  });
});
