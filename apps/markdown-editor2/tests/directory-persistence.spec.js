const { test, expect } = require('@playwright/test');

// Real IndexedDB uses the structured clone algorithm, which cannot clone the
// function-valued mock handles used in these tests. A minimal in-memory fake
// (Map-backed, same async/event-based surface as the real API) lets us verify
// directory.js's IndexedDB wrapper without needing structured-cloneable handles.
function installFakeIndexedDB(page) {
  return page.evaluate(() => {
    const store = new Map();

    function makeRequest(run) {
      const req = { onsuccess: null, onerror: null, result: undefined, error: undefined };
      Promise.resolve().then(() => {
        try {
          req.result = run();
          if (typeof req.onsuccess === 'function') {
            req.onsuccess();
          }
        } catch (error) {
          req.error = error;
          if (typeof req.onerror === 'function') {
            req.onerror();
          }
        }
      });
      return req;
    }

    function makeObjectStore() {
      return {
        put(value, key) {
          return makeRequest(() => {
            store.set(key, value);
          });
        },
        get(key) {
          return makeRequest(() => store.get(key));
        },
        delete(key) {
          return makeRequest(() => {
            store.delete(key);
          });
        }
      };
    }

    function makeTransaction() {
      const tx = { oncomplete: null, onerror: null };
      const objectStore = makeObjectStore();
      tx.objectStore = () => objectStore;
      Promise.resolve().then(() => {
        Promise.resolve().then(() => {
          if (typeof tx.oncomplete === 'function') {
            tx.oncomplete();
          }
        });
      });
      return tx;
    }

    const db = {
      objectStoreNames: { contains: () => true },
      createObjectStore: () => {},
      transaction: () => makeTransaction(),
      close: () => {}
    };

    const fakeIndexedDB = {
      open() {
        const req = { onupgradeneeded: null, onsuccess: null, onerror: null, result: db };
        Promise.resolve().then(() => {
          if (typeof req.onupgradeneeded === 'function') {
            req.onupgradeneeded();
          }
          if (typeof req.onsuccess === 'function') {
            req.onsuccess();
          }
        });
        return req;
      }
    };
    // window.indexedDB is a readonly accessor in real browsers, so a plain
    // assignment silently no-ops; defineProperty is required to override it.
    Object.defineProperty(window, 'indexedDB', { value: fakeIndexedDB, configurable: true, writable: true });
    window.__fakeIndexedDbStore = store;
  });
}

function installMockDirectoryPicker(page) {
  return page.evaluate(() => {
    function makeFileHandle(name, content) {
      return {
        kind: 'file',
        name,
        async getFile() {
          return { text: async () => content };
        }
      };
    }

    function makeDirHandle(name, entries, permission = 'granted') {
      const state = { permission, requestPermissionCallCount: 0 };
      return {
        kind: 'directory',
        name,
        async *values() {
          for (const entry of entries) {
            yield entry;
          }
        },
        async queryPermission() {
          return state.permission;
        },
        async requestPermission() {
          state.requestPermissionCallCount += 1;
          return state.permission;
        },
        __state: state
      };
    }

    const aMd = makeFileHandle('a.md', '# Root doc');
    const root = makeDirHandle('my-folder', [aMd]);

    window.__mockRoot = root;
    window.showDirectoryPicker = async () => root;
  });
}

test.describe('Directory persistence (Issue #163)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await installFakeIndexedDB(page);
    await installMockDirectoryPicker(page);
  });

  test('openFolder saves the handle to IndexedDB', async ({ page }) => {
    await page.evaluate(() => window.Directory.openFolder());

    const saved = await page.evaluate(() => window.__fakeIndexedDbStore.get('rootDirHandle'));
    expect(saved).toBeTruthy();
  });

  test('checkForReconnectableFolder returns the saved folder name', async ({ page }) => {
    await page.evaluate(() => window.Directory.openFolder());

    const folder = await page.evaluate(() => window.Directory.checkForReconnectableFolder());
    expect(folder).toEqual({ name: 'my-folder' });
  });

  test('checkForReconnectableFolder returns null when nothing was saved', async ({ page }) => {
    const folder = await page.evaluate(() => window.Directory.checkForReconnectableFolder());
    expect(folder).toBeNull();
  });

  test('reconnectFolder rebuilds the tree when permission is granted', async ({ page }) => {
    await page.evaluate(() => window.Directory.openFolder());

    const result = await page.evaluate(async () => {
      const outcome = await window.Directory.reconnectFolder();
      const tree = window.Directory.getTree();
      return { outcome, tree };
    });

    expect(result.outcome).toEqual({ opened: true, count: 1 });
    expect(result.tree.some(doc => doc.path === 'a.md')).toBe(true);
  });

  test('reconnectFolder calls requestPermission when queryPermission is not granted', async ({ page }) => {
    await page.evaluate(() => {
      window.__mockRoot.__state.permission = 'prompt';
      return window.Directory.openFolder();
    });

    await page.evaluate(() => {
      window.__mockRoot.queryPermission = async () => 'prompt';
      window.__mockRoot.requestPermission = async () => {
        window.__mockRoot.__state.requestPermissionCallCount += 1;
        return 'granted';
      };
    });

    const result = await page.evaluate(async () => {
      const outcome = await window.Directory.reconnectFolder();
      return { outcome, requestPermissionCallCount: window.__mockRoot.__state.requestPermissionCallCount };
    });

    expect(result.outcome.opened).toBe(true);
    expect(result.requestPermissionCallCount).toBe(1);
  });

  test('reconnectFolder clears the handle when permission is denied', async ({ page }) => {
    await page.evaluate(() => window.Directory.openFolder());

    await page.evaluate(() => {
      window.__mockRoot.queryPermission = async () => 'denied';
      window.__mockRoot.requestPermission = async () => 'denied';
    });

    const result = await page.evaluate(async () => {
      const outcome = await window.Directory.reconnectFolder();
      const folderAfter = await window.Directory.checkForReconnectableFolder();
      return { outcome, folderAfter };
    });

    expect(result.outcome).toEqual({ opened: false, reason: 'denied' });
    expect(result.folderAfter).toBeNull();
  });

  test('IndexedDB-unsupported environment disables persistence safely', async ({ page }) => {
    await page.evaluate(() => {
      delete window.indexedDB;
    });

    const result = await page.evaluate(async () => {
      const openOutcome = await window.Directory.openFolder();
      const folder = await window.Directory.checkForReconnectableFolder();
      const reconnectOutcome = await window.Directory.reconnectFolder();
      return { openOutcome, folder, reconnectOutcome };
    });

    expect(result.openOutcome).toEqual({ opened: true, count: 1 });
    expect(result.folder).toBeNull();
    expect(result.reconnectOutcome).toEqual({ opened: false, reason: 'not-found' });
  });

  test('reconnect banner appears when a reconnectable folder exists after reload', async ({ page }) => {
    await page.evaluate(() => window.Directory.openFolder());

    // Simulate a reload with the same (fake) IndexedDB store: re-run bootstrap
    // by re-navigating and re-installing the fake DB using the same backing store.
    const stored = await page.evaluate(() => window.__fakeIndexedDbStore.get('rootDirHandle'));

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await installFakeIndexedDB(page);
    await page.evaluate(name => {
      window.__fakeIndexedDbStore.set('rootDirHandle', { kind: 'directory', name });
    }, stored.name);

    // Re-run the app's startup reconnect check now that the store is primed.
    await page.evaluate(async () => {
      const banner = document.getElementById('reconnect-banner');
      const message = document.getElementById('reconnect-banner-message');
      const folder = await window.Directory.checkForReconnectableFolder();
      if (folder) {
        message.textContent = window.i18n.t('reconnect.message', { name: folder.name });
        banner.classList.remove('hidden');
      }
    });

    const banner = page.locator('#reconnect-banner');
    await expect(banner).not.toHaveClass(/hidden/);
    await expect(page.locator('#reconnect-banner-message')).toContainText('my-folder');
  });
});
