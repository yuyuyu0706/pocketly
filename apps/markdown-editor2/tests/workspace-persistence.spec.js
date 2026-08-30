const { test, expect } = require('@playwright/test');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAE0lEQVR42mP8z/D/PwMDAwMAAAIABJACJ1gAAAAASUVORK5CYII=';

async function buildFixtureFolder() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-workspace-persist-'));
  const folder = path.join(root, 'my-folder');
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, 'a.md'), '# Root doc');
  return folder;
}

async function importAndActivate(page, folder) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // Issue #210: startup now always seeds+persists welcome.md, so importFolder()
  // always finds an existing workspace and asks for confirmation before replacing it.
  await page.evaluate(() => {
    window.confirm = () => true;
  });
  await page.setInputFiles('#folder-input', folder);
  await page.waitForFunction(() => window.Directory.getTree().some(d => d.path === 'my-folder/a.md'));
  await page.evaluate(() => {
    const target = window.Directory.getTree().find(d => d.path === 'my-folder/a.md');
    window.Directory.activateDocument(target.id);
  });
}

test.describe('Workspace edit persistence and pasted-asset integration (Issue #176)', () => {
  test('editing a directory-backed document survives reload', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await importAndActivate(page, folder);

    await page.evaluate(() => {
      window.AppState.setText('# Root doc\n\nedited content', 'editor');
    });
    await page.waitForTimeout(500);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 1);

    const text = await page.evaluate(() => {
      const target = window.Directory.getTree().find(d => d.path === 'my-folder/a.md');
      window.Directory.activateDocument(target.id);
      return window.AppState.getText();
    });
    expect(text).toBe('# Root doc\n\nedited content');
  });

  test('editing the seeded welcome.md on a fresh launch does write to IndexedDB (Issue #210)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 1);

    await page.evaluate(() => {
      window.AppState.setText('# welcome edit', 'editor');
    });
    await page.waitForTimeout(500);

    const workspace = await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const req = window.indexedDB.open('mew-workspace-store', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const result = await new Promise((resolve, reject) => {
        const tx = db.transaction('workspaces', 'readonly');
        const getReq = tx.objectStore('workspaces').get('default');
        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => reject(getReq.error);
      });
      db.close();
      return result;
    });
    expect(workspace).not.toBeNull();
    expect(workspace.documents).toEqual([{ path: 'welcome.md', text: '# welcome edit' }]);
  });

  test('pasted image on a directory-backed document inserts standard Markdown image syntax and survives reload', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await importAndActivate(page, folder);

    const filePath = path.join(folder, 'pasted.png');
    await fs.writeFile(filePath, Buffer.from(PNG_BASE64, 'base64'));

    await page.setInputFiles('#imageInput', filePath);
    await page.waitForFunction(() => window.AppState.getText().includes('pasted.png'));

    const text = await page.evaluate(() => window.AppState.getText());
    expect(text).toContain('![pasted.png](assets/pasted.png)');

    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 1);

    const src = await page.evaluate(() => new Promise(resolve => {
      const target = window.Directory.getTree().find(d => d.path === 'my-folder/a.md');
      window.Directory.activateDocument(target.id);
      const check = () => {
        const img = document.querySelector('#preview img[alt="pasted.png"]');
        if (img && img.getAttribute('src').startsWith('blob:')) {
          resolve(img.getAttribute('src'));
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    }));
    expect(src.startsWith('blob:')).toBe(true);
  });

  test('restoreOnStartup() seeds welcome.md for an empty-documents workspace record left by clearWorkspace() (Issue #181 / #210)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const fallbackText = await page.evaluate(() => window.AppState.getFallbackText());

    // Pre-seed IndexedDB with the shape left behind by Directory.clearWorkspace():
    // an empty documents/assets array with a null importedAt.
    await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const req = window.indexedDB.open('mew-workspace-store', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('workspaces', 'readwrite');
        tx.objectStore('workspaces').put(
          { documents: [], assets: [], importedAt: null },
          'default'
        );
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 1);

    const result = await page.evaluate(() => ({
      docCount: window.AppState.listDocuments().length,
      activeText: window.AppState.getText(),
      tree: window.Directory.getTree().map(entry => entry.path),
      activePath: window.Directory.getActivePath()
    }));

    expect(result.docCount).toBe(1);
    expect(result.activeText).toBe(fallbackText);
    expect(result.tree).toEqual(['welcome.md']);
    expect(result.activePath).toBe('welcome.md');
  });

  test('true first launch (no IndexedDB record) seeds welcome.md, shows it in the tree, and keeps the "+" (new file) entry point available (Issue #210)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 1);

    const fallbackText = await page.evaluate(() => window.AppState.getFallbackText());

    const result = await page.evaluate(() => ({
      tree: window.Directory.getTree().map(entry => entry.path),
      activePath: window.Directory.getActivePath(),
      activeText: window.AppState.getText()
    }));

    expect(result.tree).toEqual(['welcome.md']);
    expect(result.activePath).toBe('welcome.md');
    expect(result.activeText).toBe(fallbackText);

    await expect(page.locator('#file-tree')).not.toHaveClass(/hidden/);
    await expect(page.locator('.file-tree-add-btn')).toBeVisible();
  });

  // Note (Issue #210): restoreOnStartup() now always seeds+persists welcome.md,
  // so currentImportedAt is never null after startup and every session is
  // directory-backed from the first paint. The non-directory-backed
  // imageMap/base64 paste path is no longer reachable via a plain page load;
  // this scenario is intentionally no longer covered here.
});
