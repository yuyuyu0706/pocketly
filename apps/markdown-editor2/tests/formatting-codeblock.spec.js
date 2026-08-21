/**
 * Lv2-14: フォーマットメニュー「コードブロック」項目の検証
 *
 * 対象: applyCodeBlockFormatting() およびフォーマットメニューへの
 *       codeBlockButton 追加（inlineCodeButton の直後）
 */
const { test, expect } = require('@playwright/test');

const EDITOR = '#editor';

async function setEditorValue(page, value) {
  await page.evaluate(v => {
    document.getElementById('editor').value = v;
  }, value);
}

test.describe('Lv2-14: コードブロック フォーマットメニュー', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('#toggle-mode');
  });

  test('選択範囲が空の状態でコードブロックボタンをクリックすると ```\\n\\n``` が挿入され、カーソルが中央の空行に置かれる', async ({ page }) => {
    await setEditorValue(page, '');

    const result = await page.evaluate(() => {
      const editor = document.getElementById('editor');
      editor.focus();
      editor.selectionStart = 0;
      editor.selectionEnd = 0;
      window.__formattingTest.showFormattingMenu(50, 50);
      const button = document.querySelector('.formatting-menu-button[data-action="code-block"]');
      button.click();
      return {
        value: editor.value,
        selectionStart: editor.selectionStart,
        selectionEnd: editor.selectionEnd,
      };
    });

    expect(result.value).toBe('```\n\n```');
    expect(result.selectionStart).toBe(4);
    expect(result.selectionEnd).toBe(4);
  });

  test('テキストを選択してコードブロックボタンをクリックすると選択範囲が ```\\n...\\n``` で囲まれる', async ({ page }) => {
    await setEditorValue(page, 'const x = 1;');

    const result = await page.evaluate(() => {
      const editor = document.getElementById('editor');
      editor.focus();
      editor.selectionStart = 0;
      editor.selectionEnd = editor.value.length;
      window.__formattingTest.showFormattingMenu(50, 50);
      const button = document.querySelector('.formatting-menu-button[data-action="code-block"]');
      button.click();
      return { value: editor.value };
    });

    expect(result.value).toBe('```\nconst x = 1;\n```');
  });

  test('既にコードブロックで囲まれた範囲を選択して再度クリックすると装飾が除去される', async ({ page }) => {
    await setEditorValue(page, '```\nconst x = 1;\n```');

    const result = await page.evaluate(() => {
      const editor = document.getElementById('editor');
      editor.focus();
      editor.selectionStart = 0;
      editor.selectionEnd = editor.value.length;
      window.__formattingTest.showFormattingMenu(50, 50);
      const button = document.querySelector('.formatting-menu-button[data-action="code-block"]');
      button.click();
      return { value: editor.value };
    });

    expect(result.value).toBe('const x = 1;');
  });

  test('右クリックでフォーマットメニューが開き、コードブロックボタンが表示される', async ({ page }) => {
    await setEditorValue(page, 'hello');
    await page.evaluate(() => {
      const editor = document.getElementById('editor');
      editor.focus();
      editor.selectionStart = 0;
      editor.selectionEnd = 5;
    });

    await page.dispatchEvent(EDITOR, 'contextmenu', { clientX: 60, clientY: 60 });

    const button = page.locator('.formatting-menu-button[data-action="code-block"]');
    await expect(button).toBeVisible();
  });

  test('既存のフォーマットメニュー項目（太字・インラインコード等）に回帰がない', async ({ page }) => {
    await setEditorValue(page, 'hello');
    await page.evaluate(() => {
      const editor = document.getElementById('editor');
      editor.focus();
      editor.selectionStart = 0;
      editor.selectionEnd = 5;
    });

    await page.dispatchEvent(EDITOR, 'contextmenu', { clientX: 60, clientY: 60 });

    const actions = await page.locator('.formatting-menu-button').evaluateAll(
      nodes => nodes.map(n => n.dataset.action)
    );

    expect(actions).toEqual([
      'bold',
      'inline-code',
      'code-block',
      'external-link',
      'copy',
      'cut',
      'paste',
    ]);
  });
});
