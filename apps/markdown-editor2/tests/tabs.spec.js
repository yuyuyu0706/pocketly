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
  });

  test('the initial Welcome document is shown as a tab with the untitled label', async ({ page }) => {
    const tabBar = page.locator('#tab-bar');
    await expect(tabBar.locator('.tab-bar-item')).toHaveCount(1);
    await expect(tabBar.locator('.tab-bar-item')).toContainText('Untitled');
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
});
