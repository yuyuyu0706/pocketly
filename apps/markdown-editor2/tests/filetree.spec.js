const { test, expect } = require('@playwright/test');

// Builds a directory handle tree usable by window.showDirectoryPicker(), mirroring
// the shape used in tests/directory-persistence.spec.js.
function installMockDirectoryPicker(page) {
  return page.evaluate(() => {
    function makeFileHandle(name, content) {
      return {
        kind: 'file',
        name,
        async getFile() {
          return { text: async () => content };
        }
      };
    }

    function makeDirHandle(name, entries) {
      return {
        kind: 'directory',
        name,
        async *values() {
          for (const entry of entries) {
            yield entry;
          }
        }
      };
    }

    // Layout:
    //   index.md
    //   b.md
    //   notes/
    //     other.md
    //     index.md
    //   zeta/
    //     z.md
    const notes = makeDirHandle('notes', [
      makeFileHandle('other.md', '# Other'),
      makeFileHandle('index.md', '# Notes index')
    ]);
    const zeta = makeDirHandle('zeta', [makeFileHandle('z.md', '# Z')]);
    const root = makeDirHandle('my-folder', [
      makeFileHandle('index.md', '# Root index'),
      makeFileHandle('b.md', '# B'),
      notes,
      zeta
    ]);

    window.showDirectoryPicker = async () => root;
  });
}

test.describe('File tree (Issue #165 / MEW-011)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await installMockDirectoryPicker(page);
  });

  test('file tree is hidden before a folder is opened', async ({ page }) => {
    const fileTree = page.locator('#file-tree');
    await expect(fileTree).toHaveClass(/hidden/);
    await expect(page.locator('#toc-headings')).toBeVisible();
  });

  test('opening a folder renders a nested tree and reveals the panel', async ({ page }) => {
    await page.evaluate(() => window.Directory.openFolder());

    const fileTree = page.locator('#file-tree');
    await expect(fileTree).not.toHaveClass(/hidden/);

    // notes/ and zeta/ should render as folders, each containing their files.
    const notesFolder = fileTree.locator('.file-tree-folder', { hasText: 'notes' });
    await expect(notesFolder).toBeVisible();
    await expect(notesFolder.locator('.file-tree-file', { hasText: 'other.md' })).toBeVisible();
    await expect(notesFolder.locator('.file-tree-file', { hasText: 'index.md' })).toBeVisible();
  });

  test('index.md is promoted to the top of its level', async ({ page }) => {
    await page.evaluate(() => window.Directory.openFolder());

    const fileTree = page.locator('#file-tree');
    const rootNames = await fileTree
      .locator(':scope > .file-tree-list > .file-tree-item > .file-tree-label')
      .allTextContents();

    // Folders (notes, zeta) sort before files at the root; within the root files,
    // index.md must lead ahead of b.md.
    const fileNamesOnly = rootNames.filter(name => name === 'index.md' || name === 'b.md');
    expect(fileNamesOnly).toEqual(['index.md', 'b.md']);
  });

  test('folders sort before files, both alphabetically', async ({ page }) => {
    await page.evaluate(() => window.Directory.openFolder());

    const fileTree = page.locator('#file-tree');
    const rootNames = await fileTree
      .locator(':scope > .file-tree-list > .file-tree-item > .file-tree-label')
      .allTextContents();

    expect(rootNames).toEqual(['notes', 'zeta', 'index.md', 'b.md']);
  });

  test('clicking a file activates the document and highlights it', async ({ page }) => {
    await page.evaluate(() => window.Directory.openFolder());

    const fileTree = page.locator('#file-tree');
    await fileTree.locator('.file-tree-file', { hasText: 'b.md' }).locator('.file-tree-label').click();

    await expect(page.locator('#editor')).toHaveValue('# B');
    await expect(fileTree.locator('.file-tree-file.active')).toContainText('b.md');
  });

  test('clicking a folder toggles it open/closed without switching documents', async ({ page }) => {
    await page.evaluate(() => window.Directory.openFolder());

    const editorBefore = await page.locator('#editor').inputValue();
    const fileTree = page.locator('#file-tree');
    const zetaFolder = fileTree.locator('.file-tree-folder', { hasText: 'zeta' });

    await expect(zetaFolder).toHaveClass(/open/);
    await expect(zetaFolder.locator('.file-tree-file', { hasText: 'z.md' })).toBeVisible();

    await zetaFolder.locator(':scope > .file-tree-label').click();
    await expect(zetaFolder).not.toHaveClass(/open/);
    await expect(zetaFolder.locator('.file-tree-file', { hasText: 'z.md' })).toBeHidden();

    // The editor content must not have changed just from toggling the folder.
    await expect(page.locator('#editor')).toHaveValue(editorBefore);
  });

  test('does not regress the existing heading TOC when no folder is open', async ({ page }) => {
    await page.fill('#editor', '# Heading A\n\nBody text.\n\n## Heading B\n');
    await page.dispatchEvent('#editor', 'input');

    const tocHeadings = page.locator('#toc-headings');
    await expect(tocHeadings.locator('.toc-item')).toHaveCount(2);
    await expect(page.locator('#file-tree')).toHaveClass(/hidden/);
  });
});
