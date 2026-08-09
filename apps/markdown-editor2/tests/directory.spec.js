const { test, expect } = require('@playwright/test');

function installMockDirectoryPicker(page) {
  return page.evaluate(() => {
    function makeFileHandle(name, content) {
      const state = { getFileCallCount: 0 };
      return {
        kind: 'file',
        name,
        async getFile() {
          state.getFileCallCount += 1;
          return { text: async () => content };
        },
        __state: state
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

    const bMd = makeFileHandle('b.md', '# Sub doc');
    const subDir = makeDirHandle('sub', [bMd]);
    const aMd = makeFileHandle('a.md', '# Root doc');
    const hiddenMd = makeFileHandle('.hidden.md', 'should be excluded');
    const notesTxt = makeFileHandle('notes.txt', 'not markdown');
    const hiddenDir = makeDirHandle('.git', [makeFileHandle('config.md', 'excluded via hidden dir')]);

    const root = makeDirHandle('root', [aMd, hiddenMd, notesTxt, hiddenDir, subDir]);

    window.__mockHandles = { aMd, bMd };
    window.showDirectoryPicker = async () => root;
  });
}

test.describe('Directory (Issue #154)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await installMockDirectoryPicker(page);
  });

  test('openFolder registers only .md files, excluding hidden files/dirs and non-.md files', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const before = window.AppState.getActiveDocumentId();
      const outcome = await window.Directory.openFolder();
      const docs = window.AppState.listDocuments();
      return { before, outcome, docs, registrySize: window.__directoryTest.getRegistrySize() };
    });

    expect(result.outcome).toEqual({ opened: true, count: 2 });
    expect(result.registrySize).toBe(2);
    expect(result.docs.length).toBe(2);
    const paths = result.docs.map(d => d.meta.path).sort();
    expect(paths).toEqual(['a.md', 'sub/b.md']);
    result.docs.forEach(doc => {
      expect(doc.meta.loaded).toBe(false);
    });
  });

  test('opening a folder closes the app-launch initial document', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const initialId = window.AppState.getActiveDocumentId();
      await window.Directory.openFolder();
      const ids = window.AppState.listDocuments().map(d => d.id);
      return { initialId, ids };
    });

    expect(result.ids).not.toContain(result.initialId);
  });

  test('activateDocument lazily loads file content and reflects it via getText()', async ({ page }) => {
    const result = await page.evaluate(async () => {
      await window.Directory.openFolder();
      const tree = window.Directory.getTree();
      const target = tree.find(d => d.path === 'a.md');

      await window.Directory.activateDocument(target.id);

      return {
        activeId: window.AppState.getActiveDocumentId(),
        targetId: target.id,
        text: window.AppState.getText(),
        loaded: window.Directory.getTree().find(d => d.id === target.id).loaded
      };
    });

    expect(result.activeId).toBe(result.targetId);
    expect(result.text).toBe('# Root doc');
    expect(result.loaded).toBe(true);
  });

  test('a second activateDocument call does not re-invoke getFile (loaded cache)', async ({ page }) => {
    const result = await page.evaluate(async () => {
      await window.Directory.openFolder();
      const tree = window.Directory.getTree();
      const target = tree.find(d => d.path === 'a.md');

      await window.Directory.activateDocument(target.id);
      const otherId = window.Directory.getTree().find(d => d.path === 'sub/b.md').id;
      await window.Directory.activateDocument(otherId);
      await window.Directory.activateDocument(target.id);

      return { getFileCallCount: window.__mockHandles.aMd.__state.getFileCallCount };
    });

    expect(result.getFileCallCount).toBe(1);
  });

  test('returns unsupported when showDirectoryPicker is not available', async ({ page }) => {
    const result = await page.evaluate(async () => {
      delete window.showDirectoryPicker;
      return window.Directory.openFolder();
    });

    expect(result).toEqual({ opened: false, reason: 'unsupported' });
  });

  test('returns cancelled when the user dismisses the directory picker', async ({ page }) => {
    const result = await page.evaluate(async () => {
      window.showDirectoryPicker = async () => {
        const error = new Error('The user aborted a request.');
        error.name = 'AbortError';
        throw error;
      };
      return window.Directory.openFolder();
    });

    expect(result).toEqual({ opened: false, reason: 'cancelled' });
  });

  test('activateDocument leaves the document unloaded and does not throw when getFile() fails', async ({ page }) => {
    const result = await page.evaluate(async () => {
      await window.Directory.openFolder();
      const target = window.Directory.getTree().find(d => d.path === 'a.md');
      window.__mockHandles.aMd.getFile = async () => {
        throw new Error('permission revoked');
      };

      await window.Directory.activateDocument(target.id);

      return {
        text: window.AppState.getText(),
        loaded: window.Directory.getTree().find(d => d.id === target.id).loaded
      };
    });

    expect(result.text).toBe('');
    expect(result.loaded).toBe(false);
  });
});
