const { test, expect } = require('@playwright/test');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

// Single-file operations (Issue #196 / MEW-011 Lv3-1): create/delete/rename
// + right-click menu foundation. Mirrors tests/filetree.spec.js's
// fixture-folder pattern.
async function buildFixtureFolder() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-fileexplorer-'));
  const folder = path.join(root, 'my-folder');
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, 'a.md'), '# A');
  await fs.writeFile(path.join(folder, 'b.md'), '# B');
  return folder;
}

test.describe('Single file operations (Issue #196 / MEW-011 Lv3-1)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('header "+" creates a file at root', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 1);

    const fileTree = page.locator('#file-tree');
    await fileTree.locator('.file-tree-add-btn').click();
    const input = fileTree.locator('.file-tree-create-input');
    await input.fill('newroot.md');
    await input.press('Enter');

    await expect(fileTree.locator('.file-tree-file', { hasText: 'newroot.md' })).toBeVisible();
    const paths = await page.evaluate(() => window.Directory.getTree().map(d => d.path));
    expect(paths).toContain('newroot.md');
  });

  test('path with "/" creates nested folder structure', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 1);

    const fileTree = page.locator('#file-tree');
    await fileTree.locator('.file-tree-add-btn').click();
    const input = fileTree.locator('.file-tree-create-input');
    await input.fill('sub/nested.md');
    await input.press('Enter');

    await expect(fileTree.locator('.file-tree-folder', { hasText: 'sub' })).toBeVisible();
    const paths = await page.evaluate(() => window.Directory.getTree().map(d => d.path));
    expect(paths).toContain('sub/nested.md');
  });

  test('extension-less input gets .md appended', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 1);

    const fileTree = page.locator('#file-tree');
    await fileTree.locator('.file-tree-add-btn').click();
    const input = fileTree.locator('.file-tree-create-input');
    await input.fill('plainname');
    await input.press('Enter');

    const paths = await page.evaluate(() => window.Directory.getTree().map(d => d.path));
    expect(paths).toContain('plainname.md');
  });

  test('disallowed extension is rejected', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 1);

    page.on('dialog', dialog => dialog.accept());

    const fileTree = page.locator('#file-tree');
    await fileTree.locator('.file-tree-add-btn').click();
    const input = fileTree.locator('.file-tree-create-input');
    await input.fill('notes.txt');
    await input.press('Enter');

    const paths = await page.evaluate(() => window.Directory.getTree().map(d => d.path));
    expect(paths).not.toContain('notes.txt');
  });

  test('duplicate filename is rejected', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    page.on('dialog', dialog => dialog.accept());

    const fileTree = page.locator('#file-tree');
    await fileTree.locator('.file-tree-add-btn').click();
    const input = fileTree.locator('.file-tree-create-input');
    await input.fill('a.md');
    await input.press('Enter');

    const paths = await page.evaluate(() => window.Directory.getTree().map(d => d.path));
    expect(paths.filter(p => p === 'a.md')).toHaveLength(1);
  });

  test('delete removes file and transitions active tab correctly', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    page.on('dialog', dialog => dialog.accept());

    const fileTree = page.locator('#file-tree');
    const activeId = await page.evaluate(() => window.AppState.getActiveDocumentId());
    const activeFile = fileTree.locator(`.file-tree-file[data-id="${activeId}"]`);
    await activeFile.locator('.file-tree-more-btn').click({ force: true });
    await page.locator('.file-tree-menu button', { hasText: 'Delete' }).click();

    await page.waitForFunction(
      prevId => window.AppState.getActiveDocumentId() !== prevId,
      activeId
    );
    const count = await page.evaluate(() => window.AppState.listDocuments().length);
    expect(count).toBe(1);
    await expect(fileTree.locator(`.file-tree-file[data-id="${activeId}"]`)).toHaveCount(0);
  });

  test('rename updates the open tab\'s label', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    const fileTree = page.locator('#file-tree');
    await fileTree.locator('.file-tree-file', { hasText: 'a.md' }).locator('.file-tree-label').click();

    const aFile = fileTree.locator('.file-tree-file', { hasText: 'a.md' });
    await aFile.locator('.file-tree-more-btn').click({ force: true });
    await page.locator('.file-tree-menu button', { hasText: 'Rename' }).click();

    const renameInput = fileTree.locator('.file-tree-rename-input');
    await renameInput.fill('renamed.md');
    await renameInput.press('Enter');

    await expect(fileTree.locator('.file-tree-file', { hasText: 'renamed.md' })).toBeVisible();
    const tabBar = page.locator('#tab-bar');
    await expect(tabBar.locator('.tab-bar-item', { hasText: 'renamed.md' })).toBeVisible();
  });

  test('rename only changes filename, not folder portion', async ({ page }) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-fileexplorer-nested-'));
    const folder = path.join(root, 'my-folder');
    await fs.mkdir(path.join(folder, 'sub'), { recursive: true });
    await fs.writeFile(path.join(folder, 'sub', 'inner.md'), '# Inner');

    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 1);

    const fileTree = page.locator('#file-tree');
    const innerFile = fileTree.locator('.file-tree-file', { hasText: 'inner.md' });
    await innerFile.locator('.file-tree-more-btn').click({ force: true });
    await page.locator('.file-tree-menu button', { hasText: 'Rename' }).click();

    const renameInput = fileTree.locator('.file-tree-rename-input');
    await renameInput.fill('renamed-inner.md');
    await renameInput.press('Enter');

    const paths = await page.evaluate(() => window.Directory.getTree().map(d => d.path));
    expect(paths).toContain('sub/renamed-inner.md');
  });

  test('create/delete/rename persist to IndexedDB across reload', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    const fileTree = page.locator('#file-tree');

    // Create.
    await fileTree.locator('.file-tree-add-btn').click();
    const createInput = fileTree.locator('.file-tree-create-input');
    await createInput.fill('created.md');
    await createInput.press('Enter');
    await expect(fileTree.locator('.file-tree-file', { hasText: 'created.md' })).toBeVisible();

    // Rename b.md -> renamed-b.md.
    const bFile = fileTree.locator('.file-tree-file', { hasText: 'b.md' });
    await bFile.locator('.file-tree-more-btn').click({ force: true });
    await page.locator('.file-tree-menu button', { hasText: 'Rename' }).click();
    const renameInput = fileTree.locator('.file-tree-rename-input');
    await renameInput.fill('renamed-b.md');
    await renameInput.press('Enter');
    await expect(fileTree.locator('.file-tree-file', { hasText: 'renamed-b.md' })).toBeVisible();

    // Delete a.md.
    page.on('dialog', dialog => dialog.accept());
    const aFile = fileTree.locator('.file-tree-file', { hasText: 'a.md' });
    await aFile.locator('.file-tree-more-btn').click({ force: true });
    await page.locator('.file-tree-menu button', { hasText: 'Delete' }).click();
    await expect(fileTree.locator('.file-tree-file', { hasText: 'a.md' })).toHaveCount(0);

    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 1);

    const paths = await page.evaluate(() => window.Directory.getTree().map(d => d.path));
    expect(paths).toContain('created.md');
    expect(paths).toContain('renamed-b.md');
    expect(paths).not.toContain('a.md');
    expect(paths).not.toContain('b.md');
  });
});
