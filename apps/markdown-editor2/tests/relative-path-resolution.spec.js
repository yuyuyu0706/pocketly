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
          if (content instanceof Blob) {
            return content;
          }
          return { text: async () => content };
        },
        __state: state
      };
    }

    function makeDirHandle(name, entries) {
      const dir = {
        kind: 'directory',
        name,
        async *values() {
          for (const entry of entries) {
            yield entry;
          }
        },
        async getDirectoryHandle(childName) {
          const found = entries.find(e => e.kind === 'directory' && e.name === childName);
          if (!found) {
            throw new Error(`not found: ${childName}`);
          }
          return found;
        },
        async getFileHandle(childName) {
          const found = entries.find(e => e.kind === 'file' && e.name === childName);
          if (!found) {
            throw new Error(`not found: ${childName}`);
          }
          return found;
        }
      };
      return dir;
    }

    const picBlob = new Blob(['fake-image-bytes'], { type: 'image/png' });
    const picPng = makeFileHandle('pic.png', picBlob);
    const assetsDir = makeDirHandle('assets', [picPng]);

    const otherMd = makeFileHandle('other.md', '# Other doc');
    const notesDir = makeDirHandle('notes', [otherMd]);

    const aMd = makeFileHandle(
      'a.md',
      '![pic](assets/pic.png)\n\n[go to other](../notes/other.md)\n\n' +
        '![pasted](data:image/png;base64,AAA)\n\n![missing](assets/missing.png)'
    );
    const subDir = makeDirHandle('sub', [aMd, assetsDir]);

    const root = makeDirHandle('root', [subDir, notesDir]);

    window.__mockHandles = { aMd, otherMd, picPng };
    window.showDirectoryPicker = async () => root;
  });
}

test.describe('Relative path resolution (Issue #156)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await installMockDirectoryPicker(page);
  });

  test('relative image src resolves to a blob: URL', async ({ page }) => {
    await page.evaluate(async () => {
      await window.Directory.openFolder();
      const target = window.Directory.getTree().find(d => d.path === 'sub/a.md');
      await window.Directory.activateDocument(target.id);
    });

    const src = await page.evaluate(() => new Promise(resolve => {
      const check = () => {
        const img = document.querySelector('#preview img[alt="pic"]');
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

  test('relative document link click activates the target document', async ({ page }) => {
    await page.evaluate(async () => {
      await window.Directory.openFolder();
      const target = window.Directory.getTree().find(d => d.path === 'sub/a.md');
      await window.Directory.activateDocument(target.id);
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
    expect(result.activePath).toBe('notes/other.md');
  });

  test('data: images (pasted/imageMap) are left untouched', async ({ page }) => {
    await page.evaluate(async () => {
      await window.Directory.openFolder();
      const target = window.Directory.getTree().find(d => d.path === 'sub/a.md');
      await window.Directory.activateDocument(target.id);
    });

    await page.waitForFunction(() => {
      const img = document.querySelector('#preview img[alt="pic"]');
      return !!(img && img.getAttribute('src').startsWith('blob:'));
    });

    const src = await page.locator('#preview img[alt="pasted"]').getAttribute('src');
    expect(src).toBe('data:image/png;base64,AAA');
  });

  test('an unresolvable relative reference is left as-is', async ({ page }) => {
    await page.evaluate(async () => {
      await window.Directory.openFolder();
      const target = window.Directory.getTree().find(d => d.path === 'sub/a.md');
      await window.Directory.activateDocument(target.id);
    });

    await page.waitForFunction(() => {
      const img = document.querySelector('#preview img[alt="pic"]');
      return !!(img && img.getAttribute('src').startsWith('blob:'));
    });

    const src = await page.locator('#preview img[alt="missing"]').getAttribute('src');
    expect(src).toBe('assets/missing.png');
  });

  test('re-rendering the same document reads the image file only once (cache)', async ({ page }) => {
    const count = await page.evaluate(async () => {
      await window.Directory.openFolder();
      const target = window.Directory.getTree().find(d => d.path === 'sub/a.md');
      await window.Directory.activateDocument(target.id);

      await new Promise(resolve => {
        const check = () => {
          const img = document.querySelector('#preview img[alt="pic"]');
          if (img && img.getAttribute('src').startsWith('blob:')) {
            resolve();
          } else {
            requestAnimationFrame(check);
          }
        };
        check();
      });

      // Re-render the same markdown a second time.
      window.AppState.setText(window.AppState.getText(), 'editor');

      await new Promise(resolve => setTimeout(resolve, 200));

      return window.__mockHandles.picPng.__state.getFileCallCount;
    });

    expect(count).toBe(1);
  });
});
