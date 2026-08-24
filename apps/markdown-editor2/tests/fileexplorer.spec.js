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
    // Issue #210: startup now always seeds+persists welcome.md, so importFolder()
    // always finds an existing workspace and asks for confirmation before replacing it.
    await page.evaluate(() => {
      window.__nativeConfirm = window.confirm.bind(window);
      window.confirm = () => true;
    });
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
    await activeFile.click({ button: 'right' });
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
    await aFile.click({ button: 'right' });
    await page.locator('.file-tree-menu button', { hasText: 'Rename' }).click();

    const renameInput = fileTree.locator('.file-tree-rename-input');
    await renameInput.fill('renamed.md');
    await renameInput.press('Enter');

    await expect(fileTree.locator('.file-tree-file', { hasText: 'renamed.md' })).toBeVisible();
    const tabBar = page.locator('#tab-bar');
    await expect(tabBar.locator('.tab-bar-item', { hasText: 'renamed.md' })).toBeVisible();
  });

  test('rename with unchanged filename closes the input without calling renameFile()', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    const fileTree = page.locator('#file-tree');
    const aFile = fileTree.locator('.file-tree-file', { hasText: 'a.md' });
    await aFile.click({ button: 'right' });
    await page.locator('.file-tree-menu button', { hasText: 'Rename' }).click();

    const renameInput = fileTree.locator('.file-tree-rename-input');
    await renameInput.press('Enter');

    // Input closes and the file is shown normally again (renameFile() was
    // never called, so no duplicate/invalid-extension alert either).
    await expect(fileTree.locator('.file-tree-rename-input')).toHaveCount(0);
    await expect(fileTree.locator('.file-tree-file', { hasText: 'a.md' })).toBeVisible();

    // Same for blur (used by the input's own blur handler to commit).
    await aFile.click({ button: 'right' });
    await page.locator('.file-tree-menu button', { hasText: 'Rename' }).click();
    await fileTree.locator('.file-tree-rename-input').blur();
    await expect(fileTree.locator('.file-tree-rename-input')).toHaveCount(0);
    await expect(fileTree.locator('.file-tree-file', { hasText: 'a.md' })).toBeVisible();
  });

  test('context menu closes when clicking elsewhere inside the file tree', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    const fileTree = page.locator('#file-tree');
    const aFile = fileTree.locator('.file-tree-file', { hasText: 'a.md' });
    await aFile.click({ button: 'right' });
    await expect(page.locator('.file-tree-menu')).toBeVisible();

    // Clicking another file-tree label (a click handler that calls
    // stopPropagation()) must still close the menu, since onDocClick is
    // registered on the capture phase.
    await fileTree.locator('.file-tree-file', { hasText: 'b.md' }).locator('.file-tree-label').click();
    await expect(page.locator('.file-tree-menu')).toHaveCount(0);
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
    await innerFile.click({ button: 'right' });
    await page.locator('.file-tree-menu button', { hasText: 'Rename' }).click();

    const renameInput = fileTree.locator('.file-tree-rename-input');
    await renameInput.fill('renamed-inner.md');
    await renameInput.press('Enter');

    const paths = await page.evaluate(() => window.Directory.getTree().map(d => d.path));
    expect(paths).toContain('sub/renamed-inner.md');
  });

  test('rename input containing "/" is rejected for a root-level file', async ({ page }) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-fileexplorer-rename-slash-'));
    await fs.writeFile(path.join(root, 'a.md'), '# A');

    await page.setInputFiles('#folder-input', root);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 1);

    const fileTree = page.locator('#file-tree');
    const pathsBefore = await page.evaluate(() => window.Directory.getTree().map(d => d.path));

    await fileTree.locator('.file-tree-file', { hasText: 'a.md' }).click({ button: 'right' });
    await page.locator('.file-tree-menu button', { hasText: 'Rename' }).click();

    let dialogMessage = null;
    page.once('dialog', dialog => {
      dialogMessage = dialog.message();
      dialog.accept();
    });

    const renameInput = fileTree.locator('.file-tree-rename-input');
    await renameInput.fill('実行基盤選定/xxx.md');
    await renameInput.press('Enter');

    await expect.poll(() => dialogMessage).not.toBeNull();

    const pathsAfter = await page.evaluate(() => window.Directory.getTree().map(d => d.path));
    expect(pathsAfter).toEqual(pathsBefore);
    expect(pathsAfter).not.toContain('実行基盤選定/xxx.md');
  });

  test('rename input containing "/" is rejected for a file inside a folder', async ({ page }) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-fileexplorer-rename-slash-nested-'));
    const folder = path.join(root, 'my-folder');
    await fs.mkdir(path.join(folder, 'sub'), { recursive: true });
    await fs.writeFile(path.join(folder, 'sub', 'inner.md'), '# Inner');

    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 1);

    const fileTree = page.locator('#file-tree');
    const pathsBefore = await page.evaluate(() => window.Directory.getTree().map(d => d.path));

    await fileTree.locator('.file-tree-file', { hasText: 'inner.md' }).click({ button: 'right' });
    await page.locator('.file-tree-menu button', { hasText: 'Rename' }).click();

    let dialogMessage = null;
    page.once('dialog', dialog => {
      dialogMessage = dialog.message();
      dialog.accept();
    });

    const renameInput = fileTree.locator('.file-tree-rename-input');
    await renameInput.fill('other/inner.md');
    await renameInput.press('Enter');

    await expect.poll(() => dialogMessage).not.toBeNull();

    const pathsAfter = await page.evaluate(() => window.Directory.getTree().map(d => d.path));
    expect(pathsAfter).toEqual(pathsBefore);
    expect(pathsAfter).not.toContain('other/inner.md');
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
    await bFile.click({ button: 'right' });
    await page.locator('.file-tree-menu button', { hasText: 'Rename' }).click();
    const renameInput = fileTree.locator('.file-tree-rename-input');
    await renameInput.fill('renamed-b.md');
    await renameInput.press('Enter');
    await expect(fileTree.locator('.file-tree-file', { hasText: 'renamed-b.md' })).toBeVisible();

    // Delete a.md.
    page.on('dialog', dialog => dialog.accept());
    const aFile = fileTree.locator('.file-tree-file', { hasText: 'a.md' });
    await aFile.click({ button: 'right' });
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

// Folder rename/delete (Issue #199 / MEW-041 Lv4-1): mirrors the single-file
// operations above, but the target is a folder node in the tree, and the
// operation must cascade to every file nested under it.
async function buildNestedFixtureFolder() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-folderops-'));
  const folder = path.join(root, 'my-folder');
  await fs.mkdir(path.join(folder, 'docs', 'sub'), { recursive: true });
  await fs.mkdir(path.join(folder, 'other'), { recursive: true });
  await fs.writeFile(path.join(folder, 'docs', 'a.md'), '# A');
  await fs.writeFile(path.join(folder, 'docs', 'sub', 'b.md'), '# B');
  await fs.writeFile(path.join(folder, 'other', 'c.md'), '# C');
  return folder;
}

// A folder <li> nests its children's markup as DOM descendants (unlike a file
// <li>, which is a leaf), so `hasText` substring matching against the <li>
// itself returns false positives (e.g. a "docs" folder containing a "sub"
// subfolder also textually "contains" the string "sub"). Each folder's own
// label span, in contrast, holds exactly its own name (no concatenation), so
// locating the unique label first and walking up to its immediate parent
// <li> avoids the ambiguity.
function folderLabel(fileTree, name) {
  return fileTree.locator('.file-tree-folder > .file-tree-row > .file-tree-label', {
    hasText: new RegExp(`^${name}$`)
  });
}

function folderLocator(fileTree, name) {
  return folderLabel(fileTree, name).locator(
    'xpath=ancestor::li[contains(concat(" ", normalize-space(@class), " "), " file-tree-folder ")][1]'
  );
}

// Right-clicking a folder <li> at its default (center) position can land on
// nested content rather than the folder's own header, since the <li>'s
// bounding box spans its entire (open) subtree. Scope the click to the
// folder's own header row instead.
function folderRow(fileTree, name) {
  return folderLocator(fileTree, name).locator(':scope > .file-tree-row');
}

test.describe('Folder rename/delete (Issue #199 / MEW-041 Lv4-1)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Issue #210: startup now always seeds+persists welcome.md, so importFolder()
    // always finds an existing workspace and asks for confirmation before replacing it.
    await page.evaluate(() => {
      window.__nativeConfirm = window.confirm.bind(window);
      window.confirm = () => true;
    });
  });

  test('renaming a folder updates the paths of all nested files', async ({ page }) => {
    const folder = await buildNestedFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 3);

    const fileTree = page.locator('#file-tree');
    await folderRow(fileTree, 'docs').click({ button: 'right' });
    await page.locator('.file-tree-menu button', { hasText: 'Rename' }).click();

    const renameInput = fileTree.locator('.file-tree-rename-input');
    await renameInput.fill('renamed-docs');
    await renameInput.press('Enter');

    await expect(folderLocator(fileTree, 'renamed-docs')).toBeVisible();
    const paths = await page.evaluate(() => window.Directory.getTree().map(d => d.path));
    expect(paths).toContain('renamed-docs/a.md');
    expect(paths).toContain('renamed-docs/sub/b.md');
    expect(paths).toContain('other/c.md');
    expect(paths).not.toContain('docs/a.md');
  });

  test('rename aborts entirely when a nested file would collide', async ({ page }) => {
    const folder = await buildNestedFixtureFolder();
    // Add a colliding file so renaming "docs" -> "other" would collide on
    // other/a.md, while other/c.md is unaffected (no swap involved).
    await fs.writeFile(path.join(folder, 'other', 'a.md'), '# collide');
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 4);

    page.on('dialog', dialog => dialog.accept());

    const fileTree = page.locator('#file-tree');
    await folderRow(fileTree, 'docs').click({ button: 'right' });
    await page.locator('.file-tree-menu button', { hasText: 'Rename' }).click();

    const renameInput = fileTree.locator('.file-tree-rename-input');
    await renameInput.fill('other');
    await renameInput.press('Enter');

    const paths = await page.evaluate(() => window.Directory.getTree().map(d => d.path));
    expect(paths).toContain('docs/a.md');
    expect(paths).toContain('docs/sub/b.md');
    expect(paths).toContain('other/a.md');
    expect(paths).toContain('other/c.md');
  });

  test('folder rename cannot move the folder to a different parent', async ({ page }) => {
    const folder = await buildNestedFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 3);

    const fileTree = page.locator('#file-tree');
    // Every discovered folder auto-expands on initial import, so "sub" is
    // already visible/open without needing to open its "docs" parent first.
    await folderRow(fileTree, 'sub').click({ button: 'right' });
    await page.locator('.file-tree-menu button', { hasText: 'Rename' }).click();

    const renameInput = fileTree.locator('.file-tree-rename-input');
    await renameInput.fill('../escaped');
    await renameInput.press('Enter');

    // "/" in the new name is rejected outright (invalid-name), leaving the
    // folder's path/parent untouched.
    const paths = await page.evaluate(() => window.Directory.getTree().map(d => d.path));
    expect(paths).toContain('docs/sub/b.md');
    expect(paths).not.toContain('docs/escaped/b.md');
    expect(paths).not.toContain('escaped/b.md');
  });

  test('deleting a folder removes all nested files and transitions the active tab', async ({ page }) => {
    const folder = await buildNestedFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 3);

    page.on('dialog', dialog => dialog.accept());

    const fileTree = page.locator('#file-tree');
    await folderRow(fileTree, 'docs').click({ button: 'right' });
    await page.locator('.file-tree-menu button', { hasText: 'Delete' }).click();

    await page.waitForFunction(() => window.AppState.listDocuments().length === 1);
    const paths = await page.evaluate(() => window.Directory.getTree().map(d => d.path));
    expect(paths).not.toContain('docs/a.md');
    expect(paths).not.toContain('docs/sub/b.md');
    expect(paths).toContain('other/c.md');
  });

  test('delete confirmation dialog mentions the affected file count', async ({ page }) => {
    const folder = await buildNestedFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 3);
    // Restore native window.confirm (stubbed in beforeEach for the folder
    // import above) so the Delete action below raises a real dialog to inspect.
    await page.evaluate(() => {
      window.confirm = window.__nativeConfirm;
    });

    let dialogMessage = null;
    page.on('dialog', dialog => {
      dialogMessage = dialog.message();
      dialog.dismiss();
    });

    const fileTree = page.locator('#file-tree');
    await folderRow(fileTree, 'docs').click({ button: 'right' });
    await page.locator('.file-tree-menu button', { hasText: 'Delete' }).click();

    await expect.poll(() => dialogMessage).not.toBeNull();
    expect(dialogMessage).toContain('2');
  });

  test('open/closed state survives a folder rename', async ({ page }) => {
    const folder = await buildNestedFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 3);

    const fileTree = page.locator('#file-tree');
    // Every discovered folder auto-expands on initial import, so close "sub"
    // explicitly first, to verify the *closed* state (not just the default
    // open one) survives its parent's rename.
    await folderLabel(fileTree, 'sub').click();
    await expect(folderLocator(fileTree, 'sub')).not.toHaveClass(/open/);

    await folderRow(fileTree, 'docs').click({ button: 'right' });
    await page.locator('.file-tree-menu button', { hasText: 'Rename' }).click();
    const renameInput = fileTree.locator('.file-tree-rename-input');
    await renameInput.fill('renamed-docs');
    await renameInput.press('Enter');

    // "sub" (now "renamed-docs/sub") stays closed rather than resetting to
    // open: its b.md is not visible, but the collapsed folder itself is.
    await expect(folderLocator(fileTree, 'sub')).not.toHaveClass(/open/);
    await expect(fileTree.locator('.file-tree-file', { hasText: 'b.md' })).toHaveCount(0);
  });
});

function fileRow(fileTree, name) {
  return fileTree.locator('.file-tree-file', { hasText: new RegExp(`^${name}$`) });
}

test.describe('Drag & drop move (Issue #206 / MEW-041 Lv4-2)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Issue #210: startup now always seeds+persists welcome.md, so importFolder()
    // always finds an existing workspace and asks for confirmation before replacing it.
    await page.evaluate(() => {
      window.__nativeConfirm = window.confirm.bind(window);
      window.confirm = () => true;
    });
  });

  test('dragging a file onto a folder moves it there', async ({ page }) => {
    const folder = await buildNestedFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 3);

    const fileTree = page.locator('#file-tree');
    await fileRow(fileTree, 'c.md').dragTo(folderRow(fileTree, 'docs'));

    const paths = await page.evaluate(() => window.Directory.getTree().map(d => d.path));
    expect(paths).toContain('docs/c.md');
    expect(paths).not.toContain('other/c.md');
  });

  test('dragging a file onto another file moves it into that file\'s parent folder', async ({ page }) => {
    const folder = await buildNestedFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 3);

    const fileTree = page.locator('#file-tree');
    await fileRow(fileTree, 'c.md').dragTo(fileRow(fileTree, 'a.md').first());

    const paths = await page.evaluate(() => window.Directory.getTree().map(d => d.path));
    expect(paths).toContain('docs/c.md');
    expect(paths).not.toContain('other/c.md');
  });

  test('dropping a file onto another file in the same folder is a no-op', async ({ page }) => {
    const folder = await buildNestedFixtureFolder();
    await fs.writeFile(path.join(folder, 'docs', 'a2.md'), '# A2');
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 4);

    let dialogFired = false;
    page.on('dialog', () => { dialogFired = true; });

    const fileTree = page.locator('#file-tree');
    await fileRow(fileTree, 'a2.md').dragTo(fileRow(fileTree, 'a.md').first());

    const paths = await page.evaluate(() => window.Directory.getTree().map(d => d.path));
    expect(paths).toContain('docs/a.md');
    expect(paths).toContain('docs/a2.md');
    expect(dialogFired).toBe(false);
  });

  test('dragging a folder onto a folder moves all nested files', async ({ page }) => {
    const folder = await buildNestedFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 3);

    const fileTree = page.locator('#file-tree');
    await folderRow(fileTree, 'sub').dragTo(folderRow(fileTree, 'other'));

    const paths = await page.evaluate(() => window.Directory.getTree().map(d => d.path));
    expect(paths).toContain('other/sub/b.md');
    expect(paths).not.toContain('docs/sub/b.md');
  });

  test('drop is aborted when the destination already has a same-name file', async ({ page }) => {
    const folder = await buildNestedFixtureFolder();
    await fs.writeFile(path.join(folder, 'other', 'a.md'), '# collide');
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 4);

    page.on('dialog', dialog => dialog.accept());

    const fileTree = page.locator('#file-tree');
    await fileRow(fileTree, 'a.md').first().dragTo(folderRow(fileTree, 'other'));

    const paths = await page.evaluate(() => window.Directory.getTree().map(d => d.path));
    expect(paths).toContain('docs/a.md');
    expect(paths).toContain('other/a.md');
  });

  test('dragging a folder onto itself or a descendant is silently ignored', async ({ page }) => {
    const folder = await buildNestedFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 3);

    let dialogFired = false;
    page.on('dialog', () => { dialogFired = true; });

    const fileTree = page.locator('#file-tree');
    await folderRow(fileTree, 'docs').dragTo(folderRow(fileTree, 'sub'));

    const paths = await page.evaluate(() => window.Directory.getTree().map(d => d.path));
    expect(paths).toContain('docs/a.md');
    expect(paths).toContain('docs/sub/b.md');
    expect(dialogFired).toBe(false);
  });

  test('dropping on the root area moves an item to the workspace root', async ({ page }) => {
    const folder = await buildNestedFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 3);

    const fileTree = page.locator('#file-tree');
    await fileRow(fileTree, 'c.md').dragTo(fileTree.locator('.file-tree-header'));

    const paths = await page.evaluate(() => window.Directory.getTree().map(d => d.path));
    expect(paths).toContain('c.md');
    expect(paths).not.toContain('other/c.md');
  });

  test('openFolders state is carried over after a folder move', async ({ page }) => {
    const folder = await buildNestedFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 3);

    const fileTree = page.locator('#file-tree');
    await folderLabel(fileTree, 'sub').click();
    await expect(folderLocator(fileTree, 'sub')).not.toHaveClass(/open/);

    await folderRow(fileTree, 'docs').dragTo(folderRow(fileTree, 'other'));

    await expect(folderLocator(fileTree, 'sub')).not.toHaveClass(/open/);
    await expect(fileTree.locator('.file-tree-file', { hasText: 'b.md' })).toHaveCount(0);
  });
});

test.describe('F2/Delete keyboard shortcuts (Issue #219 / Lv3-1)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Issue #210: startup now always seeds+persists welcome.md, so importFolder()
    // always finds an existing workspace and asks for confirmation before replacing it.
    await page.evaluate(() => {
      window.__nativeConfirm = window.confirm.bind(window);
      window.confirm = () => true;
    });
  });

  test('F2 on a focused file opens the inline rename input', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    const fileTree = page.locator('#file-tree');
    await fileTree.locator('.file-tree-file', { hasText: 'a.md' }).locator('.file-tree-label').focus();
    await page.keyboard.press('F2');

    const renameInput = fileTree.locator('.file-tree-rename-input');
    await expect(renameInput).toBeVisible();
    await renameInput.fill('renamed.md');
    await renameInput.press('Enter');

    await expect(fileTree.locator('.file-tree-file', { hasText: 'renamed.md' })).toBeVisible();
  });

  test('Delete on a focused file shows a confirm dialog and deletes on accept', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    await page.evaluate(() => {
      window.__confirmCalls = 0;
      window.confirm = () => {
        window.__confirmCalls += 1;
        return true;
      };
    });

    const fileTree = page.locator('#file-tree');
    await fileTree.locator('.file-tree-file', { hasText: 'a.md' }).locator('.file-tree-label').focus();
    await page.keyboard.press('Delete');

    await expect(fileTree.locator('.file-tree-file', { hasText: 'a.md' })).toHaveCount(0);
    expect(await page.evaluate(() => window.__confirmCalls)).toBe(1);
  });

  test('F2 on a focused folder opens the inline folder rename input', async ({ page }) => {
    const folder = await buildNestedFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 3);

    const fileTree = page.locator('#file-tree');
    await folderLabel(fileTree, 'docs').focus();
    await page.keyboard.press('F2');

    const renameInput = fileTree.locator('.file-tree-rename-input');
    await expect(renameInput).toBeVisible();
    await renameInput.fill('renamed-docs');
    await renameInput.press('Enter');

    await expect(folderLocator(fileTree, 'renamed-docs')).toBeVisible();
  });

  test('Delete on a focused folder shows a confirm dialog and deletes its contents on accept', async ({ page }) => {
    const folder = await buildNestedFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 3);

    await page.evaluate(() => {
      window.__confirmCalls = 0;
      window.confirm = () => {
        window.__confirmCalls += 1;
        return true;
      };
    });

    const fileTree = page.locator('#file-tree');
    await folderLabel(fileTree, 'other').focus();
    await page.keyboard.press('Delete');

    await expect(folderLocator(fileTree, 'other')).toHaveCount(0);
    expect(await page.evaluate(() => window.__confirmCalls)).toBe(1);
    const paths = await page.evaluate(() => window.Directory.getTree().map(d => d.path));
    expect(paths).not.toContain('other/c.md');
  });

  test('Delete while the editor is focused deletes text, not the active file', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    let dialogSeen = false;
    page.on('dialog', () => { dialogSeen = true; });

    const fileTree = page.locator('#file-tree');
    await fileTree.locator('.file-tree-file', { hasText: 'a.md' }).locator('.file-tree-label').click();
    await page.locator('#toggle-mode').click();

    const editor = page.locator('#editor');
    await editor.click();
    await editor.press('Control+End');
    const before = await editor.inputValue();
    await editor.press('Delete');
    const after = await editor.inputValue();

    expect(dialogSeen).toBe(false);
    expect(after.length).toBeLessThanOrEqual(before.length);
    await expect(fileTree.locator('.file-tree-file', { hasText: 'a.md' })).toBeVisible();
  });
});
