const { test, expect } = require('@playwright/test');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

// 手順①事前検証: Chromium PDF の /Type /Page マーカーを latin1 文字列として正規表現でカウントできることを確認済み。
// Chromium headless の pdf() API が生成する PDF は圧縮オbjStm を使わず
// /Type /Page エントリが生バイト列に含まれるため、この手法が有効。

test('exported HTML contains preview.css style (#0055aa)', async ({ page }) => {
  await page.goto('/');
  await page.click('#toggle-mode');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#export-html'),
  ]);
  const suggestedFilename = await download.suggestedFilename();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'md-html-regression-'));
  const targetPath = path.join(tempDir, suggestedFilename);
  await download.saveAs(targetPath);
  const html = await fs.readFile(targetPath, 'utf8');
  // Browser serializes #0055aa as rgb(0, 85, 170) in computed styles
  expect(html).toContain('rgb(0, 85, 170)');
});

test('exported PDF spans multiple pages for long documents', async ({ page }) => {
  await page.goto('/');

  // 手順②: A4換算10ページ相当の長文を動的生成して流し込む
  const longMarkdown = Array.from({ length: 60 }, (_, i) =>
    `## Section ${i + 1}\n\n` +
    Array.from({ length: 8 }, (_, j) =>
      `Paragraph ${j + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. ` +
      'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ' +
      'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. ' +
      'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.'
    ).join('\n\n')
  ).join('\n\n');

  await page.evaluate((md) => {
    const editor = document.getElementById('editor');
    editor.value = md;
    editor.dispatchEvent(new Event('input'));
  }, longMarkdown);

  // 手順③: win.print/win.close をスタブしてポップアップが自動クローズしないようにする
  await page.evaluate(() => {
    const orig = window.open.bind(window);
    window.open = (...args) => {
      const win = orig(...args);
      if (win) {
        win.print = () => {};
        win.close = () => {};
      }
      return win;
    };
  });

  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.click('#export-pdf'),
  ]);

  await popup.waitForLoadState('load');

  const tempPath = path.join(os.tmpdir(), `pdf-regression-${Date.now()}.pdf`);
  await popup.pdf({ path: tempPath });

  const pdfBuffer = await fs.readFile(tempPath);
  const matches = pdfBuffer.toString('latin1').match(/\/Type\s*\/Page(?!s)/g);
  const pageCount = matches ? matches.length : 0;

  await fs.unlink(tempPath).catch(() => {});

  expect(pageCount).toBeGreaterThan(1);
});

test('exported HTML spans multiple pages when printed for long documents', async ({ page, context }) => {
  await page.goto('/');
  await page.click('#toggle-mode');

  // Lv3-B と同じ長文生成ロジックを流用（見出し60件・段落8件）
  const longMarkdown = Array.from({ length: 60 }, (_, i) =>
    `## Section ${i + 1}\n\n` +
    Array.from({ length: 8 }, (_, j) =>
      `Paragraph ${j + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. ` +
      'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ' +
      'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. ' +
      'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.'
    ).join('\n\n')
  ).join('\n\n');

  await page.evaluate((md) => {
    const editor = document.getElementById('editor');
    editor.value = md;
    editor.dispatchEvent(new Event('input'));
  }, longMarkdown);

  // HTML ファイルをダウンロード保存（Lv3-A と同じパターン）
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#export-html'),
  ]);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'md-html-print-regression-'));
  const htmlPath = path.join(tempDir, await download.suggestedFilename());
  await download.saveAs(htmlPath);

  // ダウンロードした HTML を新規ページとして直接開く（window.print() 経路を経ないため Lv3-B よりシンプル）
  const filePage = await context.newPage();
  await filePage.goto(`file://${htmlPath}`);
  await filePage.waitForLoadState('load');

  // Lv3-B で確立した正規表現手法でページ数を検証
  const pdfPath = path.join(tempDir, `html-print-regression-${Date.now()}.pdf`);
  await filePage.pdf({ path: pdfPath });

  const pdfBuffer = await fs.readFile(pdfPath);
  const matches = pdfBuffer.toString('latin1').match(/\/Type\s*\/Page(?!s)/g);
  const pageCount = matches ? matches.length : 0;

  await filePage.close();
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

  expect(pageCount).toBeGreaterThan(1);
});

test('exported HTML does not contain app.css styles (100vh, #e8f0ff)', async ({ page }) => {
  await page.goto('/');
  await page.click('#toggle-mode');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#export-html'),
  ]);
  const suggestedFilename = await download.suggestedFilename();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'md-html-regression-'));
  const targetPath = path.join(tempDir, suggestedFilename);
  await download.saveAs(targetPath);
  const html = await fs.readFile(targetPath, 'utf8');
  expect(html).not.toContain('100vh');
  expect(html).not.toContain('rgb(232, 240, 255)'); // #e8f0ff の CSSOM 正規化後の値
});
