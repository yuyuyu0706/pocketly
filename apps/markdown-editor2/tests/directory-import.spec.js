const { test, expect } = require('@playwright/test');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAE0lEQVR42mP8z/D/PwMDAwMAAAIABJACJ1gAAAAASUVORK5CYII=';

async function buildFixtureFolder() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-folder-import-'));
  const folder = path.join(root, 'my-folder');
  await fs.mkdir(folder, { recursive: true });
  await fs.mkdir(path.join(folder, 'sub'), { recursive: true });
  await fs.mkdir(path.join(folder, '.git'), { recursive: true });
  await fs.mkdir(path.join(folder, 'node_modules', 'pkg'), { recursive: true });

  await fs.writeFile(path.join(folder, 'a.md'), '# Root doc');
  await fs.writeFile(path.join(folder, 'sub', 'b.md'), '# Sub doc');
  await fs.writeFile(path.join(folder, '.hidden.md'), 'should be excluded');
  await fs.writeFile(path.join(folder, 'notes.txt'), 'not markdown');
  await fs.writeFile(path.join(folder, '.git', 'config.md'), 'excluded via hidden dir');
  await fs.writeFile(path.join(folder, 'node_modules', 'pkg', 'readme.md'), 'excluded via node_modules');
  await fs.writeFile(
    path.join(folder, 'pic.png'),
    Buffer.from(PNG_BASE64, 'base64')
  );

  return folder;
}

test.describe('Directory.importFolder (Issue #171)', () => {
  test('imports only allow-listed files, excluding hidden/node_modules entries', async ({ page }) => {
    const folder = await buildFixtureFolder();

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('#folder-input', folder);

    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    const result = await page.evaluate(() => {
      const docs = window.AppState.listDocuments();
      return {
        docs,
        tree: window.Directory.getTree(),
        registrySize: window.__directoryTest.getRegistrySize()
      };
    });

    const paths = result.docs.map(d => d.meta.path).sort();
    expect(paths).toEqual(['a.md', 'sub/b.md']);
    expect(result.registrySize).toBe(2);
  });

  test('opening a folder closes the app-launch initial document', async ({ page }) => {
    const folder = await buildFixtureFolder();

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const initialId = await page.evaluate(() => window.AppState.getActiveDocumentId());

    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    const ids = await page.evaluate(() => window.AppState.listDocuments().map(d => d.id));
    expect(ids).not.toContain(initialId);
  });

  test('getTree() output shape is {id, path, loaded: true}', async ({ page }) => {
    const folder = await buildFixtureFolder();

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    const tree = await page.evaluate(() => window.Directory.getTree());
    expect(tree.length).toBe(2);
    tree.forEach(entry => {
      expect(typeof entry.id).toBe('string');
      expect(typeof entry.path).toBe('string');
      expect(entry.loaded).toBe(true);
    });
  });

  test('restoreOnStartup() restores the workspace after reload', async ({ page }) => {
    const folder = await buildFixtureFolder();

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    const paths = await page.evaluate(() =>
      window.AppState.listDocuments().map(d => d.meta.path).sort()
    );
    expect(paths).toEqual(['a.md', 'sub/b.md']);
  });

  test('re-import prompts window.confirm; cancelling keeps the existing workspace', async ({ page }) => {
    const folder = await buildFixtureFolder();

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    await page.evaluate(() => {
      window.__confirmCalls = [];
      window.confirm = message => {
        window.__confirmCalls.push(message);
        return false;
      };
    });

    await page.setInputFiles('#folder-input', folder);
    await page.waitForTimeout(200);

    const result = await page.evaluate(() => ({
      confirmCalls: window.__confirmCalls,
      docCount: window.AppState.listDocuments().length
    }));

    expect(result.confirmCalls.length).toBe(1);
    expect(result.docCount).toBe(2);
  });

  test('re-import prompts window.confirm; accepting replaces the workspace', async ({ page }) => {
    const folder = await buildFixtureFolder();

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    await page.evaluate(() => {
      window.__confirmCalls = [];
      window.confirm = message => {
        window.__confirmCalls.push(message);
        return true;
      };
    });

    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.__confirmCalls && window.__confirmCalls.length === 1);
    await page.waitForFunction(() => window.__directoryTest.getRegistrySize() >= 2);

    const result = await page.evaluate(() => ({
      confirmCalls: window.__confirmCalls,
      paths: window.AppState.listDocuments().map(d => d.meta.path).sort()
    }));

    expect(result.confirmCalls.length).toBe(1);
    expect(result.paths).toEqual(['a.md', 'sub/b.md']);
  });
});
