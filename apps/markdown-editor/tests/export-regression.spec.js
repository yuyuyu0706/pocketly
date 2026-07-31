const { test, expect } = require('@playwright/test');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

test('exported HTML contains preview.css style (#0055aa)', async ({ page }) => {
  await page.goto('/');
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

test('exported HTML does not contain app.css styles (100vh, #e8f0ff)', async ({ page }) => {
  await page.goto('/');
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
  expect(html).not.toContain('#e8f0ff');
});
