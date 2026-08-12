const { test, expect } = require('@playwright/test');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

async function buildFixtureFolder() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-clear-workspace-'));
  const folder = path.join(root, 'my-folder');
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, 'a.md'), '# Root doc');
  return folder;
}

async function buildSingleFile(name, content) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-single-file-'));
  const filePath = path.join(root, name);
  await fs.writeFile(filePath, content);
  return filePath;
}

test.describe('Directory.clearWorkspace() (Issue #179 / MEW-039)', () => {
  test('resets fileRegistry/assetRegistry/IndexedDB and restores the Welcome text', async ({ page }) => {
    const folder = await buildFixtureFolder();

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 1);

    const fallbackText = await page.evaluate(() => window.AppState.getFallbackText());

    await page.evaluate(() => {
      window.confirm = () => true;
    });
    await page.evaluate(() => window.Directory.clearWorkspace());
    await page.waitForFunction(() => window.__directoryTest.getRegistrySize() === 0);

    const result = await page.evaluate(() => ({
      registrySize: window.__directoryTest.getRegistrySize(),
      assetRegistrySize: window.__directoryTest.getAssetRegistrySize(),
      tree: window.Directory.getTree(),
      docCount: window.AppState.listDocuments().length,
      activeText: window.AppState.getText()
    }));

    expect(result.registrySize).toBe(0);
    expect(result.assetRegistrySize).toBe(0);
    expect(result.tree).toEqual([]);
    expect(result.docCount).toBe(1);
    expect(result.activeText).toBe(fallbackText);
  });

  test('cancelling the confirm dialog leaves the workspace untouched', async ({ page }) => {
    const folder = await buildFixtureFolder();

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 1);

    await page.evaluate(() => {
      window.__confirmCalls = [];
      window.confirm = message => {
        window.__confirmCalls.push(message);
        return false;
      };
    });

    await page.click('#open-btn');
    await page.click('#clear-workspace');
    await page.waitForTimeout(100);

    const result = await page.evaluate(() => ({
      confirmCalls: window.__confirmCalls,
      registrySize: window.__directoryTest.getRegistrySize()
    }));

    expect(result.confirmCalls.length).toBe(1);
    expect(result.registrySize).toBe(1);
  });
});

test.describe('Directory.importSingleFile() (Issue #179 / MEW-039)', () => {
  test('opening a file after a folder import keeps the existing folder-backed documents', async ({ page }) => {
    const folder = await buildFixtureFolder();
    const single = await buildSingleFile('single.md', '# Single doc');

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 1);

    await page.setInputFiles('#markdownInput', single);
    await page.waitForFunction(() => window.__directoryTest.getRegistrySize() >= 2);

    const paths = await page.evaluate(() => window.Directory.getTree().map(entry => entry.path).sort());
    expect(paths).toEqual(['a.md', 'single.md']);

    const activeText = await page.evaluate(() => window.AppState.getText());
    expect(activeText).toBe('# Single doc');
  });

  test('opening a file with the same name overwrites the previous entry', async ({ page }) => {
    const single = await buildSingleFile('dup.md', '# First');

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('#markdownInput', single);
    await page.waitForFunction(() => window.__directoryTest.getRegistrySize() >= 1);

    const single2 = await buildSingleFile('dup.md', '# Second');
    await page.setInputFiles('#markdownInput', single2);
    await page.waitForFunction(() => window.AppState.getText() === '# Second');

    const result = await page.evaluate(() => ({
      registrySize: window.__directoryTest.getRegistrySize(),
      paths: window.Directory.getTree().map(entry => entry.path)
    }));

    expect(result.registrySize).toBe(1);
    expect(result.paths).toEqual(['dup.md']);
  });

  test('opened file is added to fileRegistry and becomes active', async ({ page }) => {
    const single = await buildSingleFile('note.md', '# Note');

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('#markdownInput', single);
    await page.waitForFunction(() => window.__directoryTest.getRegistrySize() >= 1);

    const result = await page.evaluate(() => ({
      tree: window.Directory.getTree(),
      activePath: window.Directory.getActivePath(),
      text: window.AppState.getText()
    }));

    expect(result.tree).toEqual([{ id: expect.any(String), path: 'note.md', loaded: true }]);
    expect(result.activePath).toBe('note.md');
    expect(result.text).toBe('# Note');
  });
});
