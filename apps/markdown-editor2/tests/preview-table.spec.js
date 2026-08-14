const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 1024 });
  await page.goto('/');
  await page.click('#toggle-mode');
});

test('table header cells receive the accent background and text color', async ({ page }) => {
  await page.fill('#editor', '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |');

  const headerCell = page.locator('#preview th').first();
  await expect(headerCell).toBeVisible();

  const style = await headerCell.evaluate(el => {
    const computed = getComputedStyle(el);
    return { backgroundColor: computed.backgroundColor, color: computed.color };
  });

  expect(style.backgroundColor).toBe('rgb(223, 239, 255)');
  expect(style.color).toBe('rgb(0, 85, 170)');
});

test('even-numbered body rows receive the zebra background', async ({ page }) => {
  await page.fill(
    '#editor',
    '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |\n| 7 | 8 |'
  );

  const rows = page.locator('#preview tbody tr');
  await expect(rows).toHaveCount(4);

  const secondRowBackground = await rows.nth(1).evaluate(el => getComputedStyle(el).backgroundColor);
  const firstRowBackground = await rows.nth(0).evaluate(el => getComputedStyle(el).backgroundColor);

  expect(secondRowBackground).toBe('rgb(244, 248, 255)');
  expect(firstRowBackground).not.toBe(secondRowBackground);
});

test('a wide table can scroll horizontally within the preview', async ({ page }) => {
  const columns = Array.from({ length: 20 }, (_, i) => `Column ${i + 1}`);
  const header = `| ${columns.join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const row = `| ${columns.map((_, i) => `value ${i + 1}`).join(' | ')} |`;
  await page.fill('#editor', [header, divider, row].join('\n'));

  const table = page.locator('#preview table').first();
  await expect(table).toBeVisible();

  const overflowX = await table.evaluate(el => getComputedStyle(el).overflowX);
  expect(overflowX).toBe('auto');
});
