const { test, expect } = require('@playwright/test');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAE0lEQVR42mP8z/D/PwMDAwMAAAIABJACJ1gAAAAASUVORK5CYII=';

async function buildFixtureFolder() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-workspace-zip-'));
  const folder = path.join(root, 'my-folder');
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, 'a.md'), '# Root doc');
  await fs.writeFile(path.join(folder, 'b.md'), '# Second doc');
  await fs.writeFile(path.join(folder, 'pic.png'), Buffer.from(PNG_BASE64, 'base64'));
  return folder;
}

async function downloadAndUnzip(page) {
  // export-workspace-zip lives inside the "Export" dropdown (read-mode only;
  // keeps the read-mode toolbar's N_read=6 item cap intact).
  await page.click('#export-btn');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#export-workspace-zip'),
  ]);
  const suggestedFilename = await download.suggestedFilename();
  expect(suggestedFilename).toMatch(/^workspace-export-\d{8}-\d{6}\.zip$/);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-workspace-zip-out-'));
  const targetPath = path.join(tempDir, suggestedFilename);
  await download.saveAs(targetPath);
  const buffer = await fs.readFile(targetPath);
  return new Uint8Array(buffer);
}

test.describe('Directory.exportWorkspaceAsZip (Issue #183 / MEW-040)', () => {
  test('folder import: zip reflects folder structure and includes assets', async ({ page }) => {
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

    const zipBytes = await downloadAndUnzip(page);
    const entries = await page.evaluate((bytes) => {
      const unzipped = window.fflate.unzipSync(new Uint8Array(bytes));
      const decoder = new TextDecoder();
      const out = {};
      Object.keys(unzipped).forEach(key => {
        out[key] = decoder.decode(unzipped[key]);
      });
      return Object.keys(out).sort();
    }, Array.from(zipBytes));

    expect(entries).toEqual(['my-folder/a.md', 'my-folder/b.md', 'my-folder/pic.png']);
  });

  test('no folder ever imported: exporting the initial Welcome document does not produce an empty zip', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const zipBytes = await downloadAndUnzip(page);
    const entryCount = await page.evaluate((bytes) => {
      const unzipped = window.fflate.unzipSync(new Uint8Array(bytes));
      return Object.keys(unzipped).length;
    }, Array.from(zipBytes));

    expect(entryCount).toBeGreaterThan(0);
  });

  test('active untracked document falls back to a disambiguated name when it collides with a registered path', async ({ page }) => {
    // Uses importSingleFile() ("Open File") rather than folder import, since
    // folder-imported paths are now always namespaced under the selected root
    // folder name (Issue #227) and could no longer collide with the
    // unprefixed "Untitled.md" fallback path generated below. Unlike folder
    // import, importSingleFile() is additive (Issue #179), so the seeded
    // welcome.md registered at startup is still exported alongside it.
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-workspace-zip-collide-'));
    const single = path.join(root, 'Untitled.md');
    await fs.writeFile(single, '# already named Untitled');

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => window.AppState.listDocuments().length >= 1);
    await page.setInputFiles('#markdownInput', single);
    await page.waitForFunction(() => window.__directoryTest.getRegistrySize() >= 2);

    // Open a second, untracked (non-registry) document and make it active,
    // so it needs a generated fallback path that collides with the
    // already-registered "Untitled.md".
    await page.evaluate(() => {
      const id = window.AppState.openDocument('# second untracked doc');
      window.AppState.switchActiveDocument(id);
    });

    const zipBytes = await downloadAndUnzip(page);
    const entries = await page.evaluate((bytes) => {
      const unzipped = window.fflate.unzipSync(new Uint8Array(bytes));
      return Object.keys(unzipped).sort();
    }, Array.from(zipBytes));

    expect(entries).toEqual(['Untitled-2.md', 'Untitled.md', 'welcome.md']);
  });
});
