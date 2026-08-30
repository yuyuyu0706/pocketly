const { test, expect } = require('@playwright/test');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAE0lEQVR42mP8z/D/PwMDAwMAAAIABJACJ1gAAAAASUVORK5CYII=';

async function buildFixtureFolder() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-relpath-'));
  const folder = path.join(root, 'my-folder');
  await fs.mkdir(path.join(folder, 'sub', 'assets'), { recursive: true });
  await fs.mkdir(path.join(folder, 'notes'), { recursive: true });

  await fs.writeFile(
    path.join(folder, 'sub', 'a.md'),
    '![pic](assets/pic.png)\n\n[go to other](../notes/other.md)\n\n' +
      '![pasted](data:image/png;base64,AAA)\n\n![missing](assets/missing.png)'
  );
  await fs.writeFile(path.join(folder, 'notes', 'other.md'), '# Other doc');
  await fs.writeFile(
    path.join(folder, 'sub', 'assets', 'pic.png'),
    Buffer.from(PNG_BASE64, 'base64')
  );

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
  await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

  await page.evaluate(() => {
    const target = window.Directory.getTree().find(d => d.path === 'my-folder/sub/a.md');
    window.Directory.activateDocument(target.id);
  });
}

test.describe('Relative path resolution (MEW-035 Lv3-2 Lv4-1, Issue #174)', () => {
  test('relative image src resolves to a blob: URL', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await importAndActivate(page, folder);

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

  test('data: images (pasted/imageMap) are left untouched', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await importAndActivate(page, folder);

    await page.waitForFunction(() => {
      const img = document.querySelector('#preview img[alt="pic"]');
      return !!(img && img.getAttribute('src').startsWith('blob:'));
    });

    const src = await page.locator('#preview img[alt="pasted"]').getAttribute('src');
    expect(src).toBe('data:image/png;base64,AAA');
  });

  test('an unresolvable relative reference is left as-is', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await importAndActivate(page, folder);

    await page.waitForFunction(() => {
      const img = document.querySelector('#preview img[alt="pic"]');
      return !!(img && img.getAttribute('src').startsWith('blob:'));
    });

    const src = await page.locator('#preview img[alt="missing"]').getAttribute('src');
    expect(src).toBe('assets/missing.png');
  });

  test('re-rendering the same document reads the image blob only once (cache)', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await importAndActivate(page, folder);

    await page.waitForFunction(() => {
      const img = document.querySelector('#preview img[alt="pic"]');
      return !!(img && img.getAttribute('src').startsWith('blob:'));
    });

    const firstSrc = await page.locator('#preview img[alt="pic"]').getAttribute('src');

    // Re-render the same markdown a second time.
    await page.evaluate(() => {
      window.AppState.setText(window.AppState.getText(), 'editor');
    });
    await page.waitForTimeout(200);

    const secondSrc = await page.locator('#preview img[alt="pic"]').getAttribute('src');
    expect(secondSrc).toBe(firstSrc);
  });

  test('after reload, restoreOnStartup() re-registers assets and the image resolves again', async ({ page }) => {
    const folder = await buildFixtureFolder();
    await importAndActivate(page, folder);

    await page.waitForFunction(() => {
      const img = document.querySelector('#preview img[alt="pic"]');
      return !!(img && img.getAttribute('src').startsWith('blob:'));
    });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 2);

    await page.evaluate(() => {
      const target = window.Directory.getTree().find(d => d.path === 'my-folder/sub/a.md');
      window.Directory.activateDocument(target.id);
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
});
