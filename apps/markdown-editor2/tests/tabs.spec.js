const { test, expect } = require('@playwright/test');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

// Mirrors tests/filetree.spec.js's fixture-folder pattern (Issue #181 / MEW-012 Lv2-8).
async function buildFixtureFolder() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-tabs-'));
  const folder = path.join(root, 'my-folder');
  await fs.mkdir(folder, { recursive: true });

  await fs.writeFile(path.join(folder, 'a.md'), '# A');
  await fs.writeFile(path.join(folder, 'b.md'), '# B');

  return folder;
}

test.describe('Multi-tab (Issue #181 / MEW-012)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Issue #210: startup now always seeds+persists welcome.md, so importFolder()
    // always finds an existing workspace and asks for confirmation before replacing it.
    await page.evaluate(() => {
      window.confirm = () => true;
    });
  });

  test('the initial Welcome document is shown as a tab with its real filename (Issue #210)', async ({ page }) => {
    const tabBar = page.locator('#tab-bar');
    await expect(tabBar.locator('.tab-bar-item')).toHaveCount(1);
    await expect(tabBar.locator('.tab-bar-item')).toContainText('welcome.md');
  });

  // Folder import's fallback-active document is not deterministically the
  // alphabetically-first file (it depends on FileList enumeration order), so
  // these tests click whichever tree file is NOT already active/highlighted.
  async function clickInactiveFile(page) {
    const inactiveFile = page.locator('#file-tree .file-tree-file:not(.active)').first();
    const name = await inactiveFile.locator('.file-tree-label').textContent();
    await inactiveFile.locator('.file-tree-label').click();
    return name;
  }

  test('opening a folder alone does not create extra tabs; clicking a file adds exactly one', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    const tabBar = page.locator('#tab-bar');
    // Folder import replaces the initial document and activates one of the
    // imported documents, so exactly one tab exists — not one per imported file.
    await expect(tabBar.locator('.tab-bar-item')).toHaveCount(1);

    const clickedName = await clickInactiveFile(page);
    await expect(tabBar.locator('.tab-bar-item')).toHaveCount(2);
    await expect(tabBar.locator('.tab-bar-item', { hasText: clickedName })).toBeVisible();
  });

  test('clicking a tab switches the active document', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    const clickedName = await clickInactiveFile(page);
    await expect(page.locator('#editor')).toHaveValue(clickedName === 'a.md' ? '# A' : '# B');

    const tabBar = page.locator('#tab-bar');
    const firstTab = tabBar.locator('.tab-bar-item').first();
    await firstTab.click();

    await expect(tabBar.locator('.tab-bar-item').first()).toHaveClass(/active/);
  });

  test('closing a tab removes it from AppState and the tab bar, with a sensible active-tab transition', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    await clickInactiveFile(page);
    const tabBar = page.locator('#tab-bar');
    await expect(tabBar.locator('.tab-bar-item')).toHaveCount(2);

    const activeTab = tabBar.locator('.tab-bar-item.active');
    const closeBtn = activeTab.locator('.tab-bar-close');
    const countBefore = await page.evaluate(() => window.AppState.listDocuments().length);
    await closeBtn.click();

    await expect(tabBar.locator('.tab-bar-item')).toHaveCount(1);
    await expect(page.locator('#editor')).not.toBeEmpty();
    const countAfter = await page.evaluate(() => window.AppState.listDocuments().length);
    expect(countAfter).toBe(countBefore - 1);
  });

  test('closing a tab then re-clicking the same file in the tree reopens it', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    const fileTree = page.locator('#file-tree');
    await fileTree.locator('.file-tree-file', { hasText: 'b.md' }).locator('.file-tree-label').click();
    await expect(page.locator('#editor')).toHaveValue('# B');

    const tabBar = page.locator('#tab-bar');
    const bTab = tabBar.locator('.tab-bar-item', { hasText: 'b.md' });
    await bTab.locator('.tab-bar-close').click();
    await expect(tabBar.locator('.tab-bar-item', { hasText: 'b.md' })).toHaveCount(0);

    // Regression: re-clicking the same file in the tree must reopen it via
    // Directory.activateDocument()'s fileRegistry fallback, not silently no-op.
    await fileTree.locator('.file-tree-file', { hasText: 'b.md' }).locator('.file-tree-label').click();
    await expect(page.locator('#editor')).toHaveValue('# B');
    await expect(tabBar.locator('.tab-bar-item', { hasText: 'b.md' })).toBeVisible();
  });

  // Regression (Issue #185): tabs and the file tree must route clicks by
  // document ID, not by label text, so same-named files in different
  // folders don't get confused with each other.
  test('same-named files in different folders open their own distinct tabs and content', async ({ page }) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-tabs-dup-'));
    const folder = path.join(root, 'my-folder');
    await fs.mkdir(path.join(folder, 'folderA'), { recursive: true });
    await fs.mkdir(path.join(folder, 'folderB'), { recursive: true });
    await fs.writeFile(path.join(folder, 'folderA', 'notes.md'), '# Notes A');
    await fs.writeFile(path.join(folder, 'folderB', 'notes.md'), '# Notes B');

    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    const fileTree = page.locator('#file-tree');
    const folderANotes = fileTree
      .locator('.file-tree-folder', { hasText: 'folderA' })
      .locator('.file-tree-file', { hasText: 'notes.md' });
    const folderBNotes = fileTree
      .locator('.file-tree-folder', { hasText: 'folderB' })
      .locator('.file-tree-file', { hasText: 'notes.md' });

    await folderANotes.locator('.file-tree-label').click();
    await expect(page.locator('#editor')).toHaveValue('# Notes A');

    await folderBNotes.locator('.file-tree-label').click();
    await expect(page.locator('#editor')).toHaveValue('# Notes B');

    const tabBar = page.locator('#tab-bar');
    await expect(tabBar.locator('.tab-bar-item', { hasText: 'notes.md' })).toHaveCount(2);

    // Clicking each tab must restore its own distinct content, proving
    // routing is by document ID rather than by the (ambiguous) label text.
    const tabs = tabBar.locator('.tab-bar-item', { hasText: 'notes.md' });
    await tabs.nth(0).click();
    const firstTabContent = await page.locator('#editor').inputValue();
    await tabs.nth(1).click();
    const secondTabContent = await page.locator('#editor').inputValue();

    expect(new Set([firstTabContent, secondTabContent])).toEqual(new Set(['# Notes A', '# Notes B']));
  });
});

test.describe('New-tab button (Issue #216)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      window.confirm = () => true;
    });
  });

  test('the "+" button is always the last child of the tab bar', async ({ page }) => {
    const tabBar = page.locator('#tab-bar');
    await expect(tabBar.locator(':scope > *').last()).toHaveClass('tab-bar-add-btn');
  });

  test('clicking "+" creates newfile.md as a new, active tab', async ({ page }) => {
    const tabBar = page.locator('#tab-bar');
    await tabBar.locator('.tab-bar-add-btn').click();

    await expect(tabBar.locator('.tab-bar-item', { hasText: 'newfile.md' })).toBeVisible();
    await expect(tabBar.locator('.tab-bar-item', { hasText: 'newfile.md' })).toHaveClass(/active/);
    await expect(page.locator('#editor')).toHaveValue('');
  });

  test('clicking "+" again avoids the name collision with a numeric suffix', async ({ page }) => {
    const tabBar = page.locator('#tab-bar');
    await tabBar.locator('.tab-bar-add-btn').click();
    await expect(tabBar.locator('.tab-bar-item', { hasText: 'newfile.md' })).toBeVisible();

    await tabBar.locator('.tab-bar-add-btn').click();
    await expect(tabBar.locator('.tab-bar-item', { hasText: 'newfile-2.md' })).toBeVisible();

    await tabBar.locator('.tab-bar-add-btn').click();
    await expect(tabBar.locator('.tab-bar-item', { hasText: 'newfile-3.md' })).toBeVisible();

    await expect(tabBar.locator('.tab-bar-item')).toHaveCount(4);
  });
});

test.describe('Tab context menu "Close other tabs" (Issue #225 / MEW-041 候補F)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      window.confirm = () => true;
    });
  });

  async function openThreeTabs(page) {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);
    const fileTree = page.locator('#file-tree');
    await fileTree.locator('.file-tree-file', { hasText: 'b.md' }).locator('.file-tree-label').click();
    return page.locator('#tab-bar');
  }

  test('right-clicking a tab opens a context menu with "Close other tabs"', async ({ page }) => {
    const tabBar = await openThreeTabs(page);
    await expect(tabBar.locator('.tab-bar-item')).toHaveCount(2);

    await tabBar.locator('.tab-bar-item').first().click({ button: 'right' });
    const menu = page.locator('.app-context-menu');
    await expect(menu).toBeVisible();
    await expect(menu.locator('button', { hasText: 'Close other tabs' })).toBeVisible();
  });

  test('running "Close other tabs" closes every tab except the clicked one', async ({ page }) => {
    const tabBar = await openThreeTabs(page);
    await expect(tabBar.locator('.tab-bar-item')).toHaveCount(2);

    const targetTab = tabBar.locator('.tab-bar-item').first();
    const targetName = await targetTab.locator('.tab-bar-label').textContent();
    await targetTab.click({ button: 'right' });
    await page.locator('.app-context-menu button', { hasText: 'Close other tabs' }).click();

    await expect(tabBar.locator('.tab-bar-item')).toHaveCount(1);
    await expect(tabBar.locator('.tab-bar-item')).toContainText(targetName);
  });

  test('the clicked tab is active afterwards even if it was inactive when right-clicked', async ({ page }) => {
    const tabBar = await openThreeTabs(page);
    await expect(tabBar.locator('.tab-bar-item')).toHaveCount(2);

    // The second tab (b.md) is active from clickInactiveFile's activation;
    // right-click the first (inactive) tab and close others from there.
    const inactiveTab = tabBar.locator('.tab-bar-item').first();
    await expect(inactiveTab).not.toHaveClass(/active/);
    const targetName = await inactiveTab.locator('.tab-bar-label').textContent();

    await inactiveTab.click({ button: 'right' });
    await page.locator('.app-context-menu button', { hasText: 'Close other tabs' }).click();

    await expect(tabBar.locator('.tab-bar-item')).toHaveCount(1);
    const remainingTab = tabBar.locator('.tab-bar-item').first();
    await expect(remainingTab).toContainText(targetName);
    await expect(remainingTab).toHaveClass(/active/);
  });

  test('the file tree context menu still works after the shared ContextMenu extraction', async ({ page }) => {
    await openThreeTabs(page);
    const fileEntry = page.locator('#file-tree .file-tree-file', { hasText: 'a.md' });
    await fileEntry.click({ button: 'right' });

    const menu = page.locator('.app-context-menu');
    await expect(menu).toBeVisible();
    await expect(menu.locator('button', { hasText: 'Rename' })).toBeVisible();
    await expect(menu.locator('button', { hasText: 'Delete' })).toBeVisible();
  });
});
