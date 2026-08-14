const { test, expect } = require('@playwright/test');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

// Mirrors tests/filetree.spec.js's fixture-folder pattern (Issue #191 / MEW-013).
async function buildFixtureFolder() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-quickswitcher-'));
  const folder = path.join(root, 'my-folder');
  await fs.mkdir(folder, { recursive: true });

  await fs.writeFile(path.join(folder, 'a.md'), '# A');
  await fs.writeFile(path.join(folder, 'b.md'), '# B');
  await fs.writeFile(path.join(folder, 'never-opened.md'), '# Never opened');

  return folder;
}

test.describe('Quick switcher (Issue #191 / MEW-013)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Ctrl+P opens the modal without triggering the browser print dialog', async ({ page }) => {
    let printFired = false;
    await page.exposeFunction('__markPrintFired', () => { printFired = true; });
    await page.evaluate(() => {
      window.addEventListener('beforeprint', () => window.__markPrintFired());
    });

    await page.keyboard.press('Control+p');

    await expect(page.locator('#quickswitcher')).not.toHaveClass(/hidden/);
    expect(printFired).toBe(false);
  });

  test('a .md file never opened as a tab appears in results and opening it activates the document', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.Directory.getTree().length >= 3);

    await page.keyboard.press('Control+p');
    await expect(page.locator('#quickswitcher')).not.toHaveClass(/hidden/);

    const item = page.locator('.quickswitcher-item', { hasText: 'never-opened.md' });
    await expect(item).toBeVisible();
    await item.click();

    await expect(page.locator('#quickswitcher')).toHaveClass(/hidden/);
    await expect(page.locator('#editor')).toHaveValue('# Never opened');
  });

  test('a document whose tab was closed remains searchable and reactivates via Directory.activateDocument', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    const fileTree = page.locator('#file-tree');
    await fileTree.locator('.file-tree-file', { hasText: 'b.md' }).locator('.file-tree-label').click();
    await expect(page.locator('#editor')).toHaveValue('# B');

    const tabBar = page.locator('#tab-bar');
    await tabBar.locator('.tab-bar-item', { hasText: 'b.md' }).locator('.tab-bar-close').click();
    await expect(tabBar.locator('.tab-bar-item', { hasText: 'b.md' })).toHaveCount(0);

    await page.keyboard.press('Control+p');
    const item = page.locator('.quickswitcher-item', { hasText: 'b.md' });
    await expect(item).toBeVisible();
    await item.click();

    await expect(page.locator('#editor')).toHaveValue('# B');
  });

  test('ArrowUp/ArrowDown move selection, Enter confirms, Escape closes', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.Directory.getTree().length >= 3);

    await page.keyboard.press('Control+p');
    await expect(page.locator('#quickswitcher')).not.toHaveClass(/hidden/);

    // Escape closes without activating anything.
    await page.keyboard.press('Escape');
    await expect(page.locator('#quickswitcher')).toHaveClass(/hidden/);

    await page.keyboard.press('Control+p');
    await expect(page.locator('#quickswitcher')).not.toHaveClass(/hidden/);

    const items = page.locator('.quickswitcher-item');
    await expect(items).not.toHaveCount(0);
    const firstLabel = await items.nth(0).textContent();
    const secondLabel = await items.nth(1).textContent();

    await page.keyboard.press('ArrowDown');
    await expect(items.nth(1)).toHaveClass(/selected/);

    await page.keyboard.press('ArrowUp');
    await expect(items.nth(0)).toHaveClass(/selected/);

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await expect(page.locator('#quickswitcher')).toHaveClass(/hidden/);
    expect(secondLabel).not.toBe(firstLabel);
  });

  test('clicking #shortcuts-btn opens the cheat window showing Ctrl+P and Ctrl+S entries', async ({ page }) => {
    const shortcutsWindow = page.locator('#shortcuts-window');
    await expect(shortcutsWindow).toHaveClass(/hidden/);

    await page.click('#shortcuts-btn');
    await expect(shortcutsWindow).not.toHaveClass(/hidden/);
    await expect(shortcutsWindow).toContainText('Ctrl');
    await expect(shortcutsWindow).toContainText('P');
    await expect(shortcutsWindow).toContainText('S');

    await page.click('#shortcuts-close');
    await expect(shortcutsWindow).toHaveClass(/hidden/);
  });
});
