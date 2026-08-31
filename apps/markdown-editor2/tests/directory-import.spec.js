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
    // Issue #210: startup now always seeds+persists welcome.md, so importFolder()
    // always finds an existing workspace and asks for confirmation before replacing it.
    await page.evaluate(() => {
      window.confirm = () => true;
    });
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
    expect(paths).toEqual(['my-folder/a.md', 'my-folder/sub/b.md']);
    expect(result.registrySize).toBe(2);
  });

  test('opening a folder closes the app-launch initial document', async ({ page }) => {
    const folder = await buildFixtureFolder();

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const initialId = await page.evaluate(() => window.AppState.getActiveDocumentId());
    await page.evaluate(() => {
      window.confirm = () => true;
    });

    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    const ids = await page.evaluate(() => window.AppState.listDocuments().map(d => d.id));
    expect(ids).not.toContain(initialId);
  });

  test('getTree() output shape is {id, path, loaded: true}', async ({ page }) => {
    const folder = await buildFixtureFolder();

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Issue #210: startup now always seeds+persists welcome.md, so importFolder()
    // always finds an existing workspace and asks for confirmation before replacing it.
    await page.evaluate(() => {
      window.confirm = () => true;
    });
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
    // Issue #210: startup now always seeds+persists welcome.md, so importFolder()
    // always finds an existing workspace and asks for confirmation before replacing it.
    await page.evaluate(() => {
      window.confirm = () => true;
    });
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    const paths = await page.evaluate(() =>
      window.AppState.listDocuments().map(d => d.meta.path).sort()
    );
    expect(paths).toEqual(['my-folder/a.md', 'my-folder/sub/b.md']);
  });

  test('re-import prompts window.confirm; cancelling keeps the existing workspace', async ({ page }) => {
    const folder = await buildFixtureFolder();

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Issue #210: startup now always seeds+persists welcome.md, so importFolder()
    // always finds an existing workspace and asks for confirmation before replacing it.
    await page.evaluate(() => {
      window.confirm = () => true;
    });
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
    // Issue #210: startup now always seeds+persists welcome.md, so importFolder()
    // always finds an existing workspace and asks for confirmation before replacing it.
    await page.evaluate(() => {
      window.confirm = () => true;
    });
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
    expect(result.paths).toEqual(['my-folder/a.md', 'my-folder/sub/b.md']);
  });

  test('relative document link click still activates the target document (pathIndex resolution unaffected)', async ({ page }) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-folder-import-links-'));
    const folder = path.join(root, 'my-folder');
    await fs.mkdir(path.join(folder, 'sub'), { recursive: true });
    await fs.mkdir(path.join(folder, 'notes'), { recursive: true });
    await fs.writeFile(
      path.join(folder, 'sub', 'a.md'),
      '[go to other](../notes/other.md)'
    );
    await fs.writeFile(path.join(folder, 'notes', 'other.md'), '# Other doc');

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Issue #210: startup now always seeds+persists welcome.md, so importFolder()
    // always finds an existing workspace and asks for confirmation before replacing it.
    await page.evaluate(() => {
      window.confirm = () => true;
    });
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    await page.evaluate(() => {
      const target = window.Directory.getTree().find(d => d.path === 'my-folder/sub/a.md');
      window.Directory.activateDocument(target.id);
    });

    await page.waitForFunction(() => {
      const anchor = document.querySelector('#preview a[href="../notes/other.md"]');
      return !!(anchor && anchor.dataset.previewDocId);
    });

    await page.click('#preview a[href="../notes/other.md"]');

    const result = await page.evaluate(() => ({
      text: window.AppState.getText(),
      activePath: window.Directory.getActivePath()
    }));

    expect(result.text).toBe('# Other doc');
    expect(result.activePath).toBe('my-folder/notes/other.md');
  });

  test('the selected folder name is shown as the top-level node in the file tree (Issue #227)', async ({ page }) => {
    const folder = await buildFixtureFolder();

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      window.confirm = () => true;
    });
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    const fileTree = page.locator('#file-tree');
    const rootNames = await fileTree
      .locator(':scope > .file-tree-list > .file-tree-item > .file-tree-row > .file-tree-label')
      .allTextContents();

    expect(rootNames).toEqual(['my-folder']);

    const paths = await page.evaluate(() => window.Directory.getTree().map(d => d.path).sort());
    expect(paths).toEqual(['my-folder/a.md', 'my-folder/sub/b.md']);
  });

  test('a root folder whose own name starts with "." is not excluded (Issue #227)', async ({ page }) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-hidden-root-'));
    const folder = path.join(root, '.hidden-root');
    await fs.mkdir(path.join(folder, 'sub'), { recursive: true });
    await fs.writeFile(path.join(folder, 'a.md'), '# A under hidden root');
    await fs.writeFile(path.join(folder, 'sub', 'b.md'), '# B under hidden root');

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      window.confirm = () => true;
    });
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    const paths = await page.evaluate(() => window.Directory.getTree().map(d => d.path).sort());
    expect(paths).toEqual(['.hidden-root/a.md', '.hidden-root/sub/b.md']);
  });

  test('a "." (e.g. .git) subfolder nested under the imported root is still excluded (Issue #227)', async ({ page }) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-nested-excluded-'));
    const folder = path.join(root, 'my-folder');
    await fs.mkdir(path.join(folder, '.git'), { recursive: true });
    await fs.mkdir(path.join(folder, 'node_modules', 'pkg'), { recursive: true });
    await fs.writeFile(path.join(folder, 'a.md'), '# Root doc');
    await fs.writeFile(path.join(folder, '.git', 'config.md'), 'excluded via nested hidden dir');
    await fs.writeFile(path.join(folder, 'node_modules', 'pkg', 'readme.md'), 'excluded via nested node_modules');

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      window.confirm = () => true;
    });
    await page.setInputFiles('#folder-input', folder);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 1);

    const paths = await page.evaluate(() => window.Directory.getTree().map(d => d.path).sort());
    expect(paths).toEqual(['my-folder/a.md']);
  });
});

test.describe('Directory.importFolder() additive re-import (Issue #229)', () => {
  async function buildFolder(prefix, entries) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    const folder = path.join(root, prefix.replace(/-$/, ''));
    await fs.mkdir(folder, { recursive: true });
    for (const [name, content] of Object.entries(entries)) {
      await fs.writeFile(path.join(folder, name), content);
    }
    return folder;
  }

  test('importing a second, non-colliding folder keeps both folders\' documents', async ({ page }) => {
    const folderA = await buildFolder('mew-additive-a-', { 'a.md': '# A' });
    const folderB = await buildFolder('mew-additive-b-', { 'b.md': '# B' });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('#folder-input', folderA);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 1);

    await page.evaluate(() => {
      window.__confirmCalls = [];
      window.confirm = message => {
        window.__confirmCalls.push(message);
        return true;
      };
    });
    await page.setInputFiles('#folder-input', folderB);
    await page.waitForFunction(() => window.__directoryTest.getRegistrySize() >= 2);

    const result = await page.evaluate(() => ({
      confirmCalls: window.__confirmCalls,
      paths: window.Directory.getTree().map(d => d.path).sort()
    }));

    // No collision between the two folders, so no confirm prompt is shown.
    expect(result.confirmCalls.length).toBe(0);
    expect(result.paths).toEqual([
      path.basename(folderA) + '/a.md',
      path.basename(folderB) + '/b.md'
    ]);
  });

  test('collision confirm dialog shows the colliding file count', async ({ page }) => {
    const folderA = await buildFolder('mew-collision-a-', { 'shared.md': '# First', 'unique-a.md': '# Unique A' });
    const folderB = await buildFolder('mew-collision-b-', { 'shared.md': '# First' });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('#folder-input', folderA);
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    // Re-importing folder A itself so its "shared.md" path collides with the
    // already-registered one; folder B's path is distinct namespace-wise
    // ("<folderB>/shared.md" != "<folderA>/shared.md"), so only re-importing
    // folder A produces a real collision.
    await page.evaluate(() => {
      window.__confirmCalls = [];
      window.confirm = message => {
        window.__confirmCalls.push(message);
        return false;
      };
    });
    await page.setInputFiles('#folder-input', folderA);
    await page.waitForTimeout(200);

    const result = await page.evaluate(() => window.__confirmCalls);
    expect(result.length).toBe(1);
    expect(result[0]).toContain('2');
  });

  test('accepting the collision confirm overwrites colliding files and adds non-colliding ones', async ({ page }) => {
    const folderA = await buildFolder('mew-accept-a-', { 'shared.md': '# Original', 'keep.md': '# Keep' });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('#folder-input', folderA);
    await page.waitForFunction(() => window.__directoryTest.getRegistrySize() >= 2);

    const folderAUpdated = await buildFolder('mew-accept-a2-', { 'shared.md': '# Updated', 'new.md': '# New' });
    // Force the second folder to reuse folder A's root name so its paths collide.
    const renamedRoot = path.join(path.dirname(folderAUpdated), path.basename(folderA));
    await fs.rename(folderAUpdated, renamedRoot);

    await page.evaluate(() => {
      window.confirm = () => true;
    });
    await page.setInputFiles('#folder-input', renamedRoot);
    await page.waitForFunction(() => window.__directoryTest.getRegistrySize() >= 3);

    const result = await page.evaluate(() => ({
      paths: window.Directory.getTree().map(d => d.path).sort(),
      sharedDoc: (() => {
        const entry = window.Directory.getTree().find(d => d.path.endsWith('shared.md'));
        window.Directory.activateDocument(entry.id);
        return window.AppState.getText();
      })()
    }));

    const root = path.basename(folderA);
    expect(result.paths).toEqual([`${root}/keep.md`, `${root}/new.md`, `${root}/shared.md`]);
    expect(result.sharedDoc).toBe('# Updated');
  });

  test('cancelling the collision confirm leaves the workspace unchanged', async ({ page }) => {
    const folderA = await buildFolder('mew-cancel-a-', { 'shared.md': '# Original' });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('#folder-input', folderA);
    await page.waitForFunction(() => window.__directoryTest.getRegistrySize() >= 1);

    await page.evaluate(() => {
      window.confirm = () => false;
    });
    await page.setInputFiles('#folder-input', folderA);
    await page.waitForTimeout(200);

    const result = await page.evaluate(() => ({
      registrySize: window.__directoryTest.getRegistrySize(),
      paths: window.Directory.getTree().map(d => d.path).sort()
    }));

    expect(result.registrySize).toBe(1);
    expect(result.paths).toEqual([`${path.basename(folderA)}/shared.md`]);
  });

  test('Clear Workspace followed by Open Folder yields the same result as a full replace', async ({ page }) => {
    const folderA = await buildFolder('mew-full-replace-a-', { 'a.md': '# A' });
    const folderB = await buildFolder('mew-full-replace-b-', { 'b.md': '# B' });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('#folder-input', folderA);
    await page.waitForFunction(() => window.__directoryTest.getRegistrySize() >= 1);

    await page.evaluate(() => {
      window.confirm = () => true;
    });
    await page.click('#open-btn');
    await page.click('#clear-workspace');
    await page.waitForFunction(() => window.__directoryTest.getRegistrySize() === 1);

    await page.setInputFiles('#folder-input', folderB);
    await page.waitForFunction(() => window.__directoryTest.getRegistrySize() >= 1);

    const paths = await page.evaluate(() => window.Directory.getTree().map(d => d.path).sort());
    expect(paths).toEqual([`${path.basename(folderB)}/b.md`]);
  });
});
