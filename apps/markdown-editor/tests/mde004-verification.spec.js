/**
 * MDE-004 検証スクリプト
 *
 * 目的: #63 が実装した replaceEditorRange (execCommand('insertText') ベース) が
 *       ブラウザのネイティブ undo スタックに正しく統合されているかを検証する。
 *
 * 判定基準:
 *   全テスト PASS → MDE-004 は #63 で解消済み。Lv2-3-3 の対象から除外可。
 *   FAIL あり    → 残課題を特定し Lv2-3-3 の対象として明記する。
 *
 * 注意: 本ファイルは Lv2-3-0 の検証用スクリプト。恒久的な回帰テストとして
 *       残すかは検証結果を踏まえて別途判断する。
 */
const { test, expect } = require('@playwright/test');

const EDITOR = '#editor';

/**
 * エディタの値を直接設定する。
 * page.fill は Playwright が内部でクリア→入力を行うため、
 * undo スタックを汚染しないよう evaluate 経由で直接代入する。
 */
async function setEditorValue(page, value, { triggerPreview = false } = {}) {
  await page.evaluate(({ v, tp }) => {
    const el = document.getElementById('editor');
    el.value = v;
    if (tp) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, { v: value, tp: triggerPreview });
}

test.describe('MDE-004: Ctrl+Z undo 検証 (replaceEditorRange / execCommand)', () => {

  test('太字 相当: replaceEditorRange で wrap した変更を Ctrl+Z で元に戻せる', async ({ page }) => {
    await page.goto('/');

    const initial = 'hello world';
    await setEditorValue(page, initial);

    // replaceEditorRange は Formatting グローバル経由で直接呼び出し
    // （applyBoldFormatting の内部実装と同じパス）
    await page.evaluate(() => {
      const editor = document.getElementById('editor');
      editor.focus();
      editor.selectionStart = 0;
      editor.selectionEnd = 5;
      Formatting.replaceEditorRange(0, 5, '**hello**');
    });

    const afterBold = await page.inputValue(EDITOR);
    expect(afterBold).toBe('**hello** world');

    await page.keyboard.press('Control+Z');
    const restored = await page.inputValue(EDITOR);
    expect(restored).toBe(initial);
  });

  test('インラインコード 相当: replaceEditorRange で wrap した変更を Ctrl+Z で元に戻せる', async ({ page }) => {
    await page.goto('/');

    const initial = 'print hello';
    await setEditorValue(page, initial);

    await page.evaluate(() => {
      const editor = document.getElementById('editor');
      editor.focus();
      editor.selectionStart = 6;
      editor.selectionEnd = 11;
      Formatting.replaceEditorRange(6, 11, '`hello`');
    });

    const afterCode = await page.inputValue(EDITOR);
    expect(afterCode).toBe('print `hello`');

    await page.keyboard.press('Control+Z');
    const restored = await page.inputValue(EDITOR);
    expect(restored).toBe(initial);
  });

  test('外部リンク 相当: replaceEditorRange で wrap した変更を Ctrl+Z で元に戻せる', async ({ page }) => {
    await page.goto('/');

    const initial = 'visit example site';
    await setEditorValue(page, initial);

    await page.evaluate(() => {
      const editor = document.getElementById('editor');
      editor.focus();
      editor.selectionStart = 6;
      editor.selectionEnd = 13;
      Formatting.replaceEditorRange(6, 13, '[example](https://example.com)');
    });

    const afterLink = await page.inputValue(EDITOR);
    expect(afterLink).toBe('visit [example](https://example.com) site');

    await page.keyboard.press('Control+Z');
    const restored = await page.inputValue(EDITOR);
    expect(restored).toBe(initial);
  });

  test('リスト自動継続: Enter で挿入された "- " を Ctrl+Z で元に戻せる', async ({ page }) => {
    await page.goto('/');

    // continueListOnEnter はカーソルが行末にある状態で Enter を押すとリスト行を追加する
    const initial = '- item1';
    await setEditorValue(page, initial);

    // カーソルを行末に配置
    await page.evaluate(() => {
      const editor = document.getElementById('editor');
      editor.focus();
      editor.selectionStart = editor.value.length;
      editor.selectionEnd = editor.value.length;
    });

    // Enter キーでリスト自動継続を発動
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);

    const afterEnter = await page.inputValue(EDITOR);
    // リスト継続で "- " が次行に挿入されることを確認
    expect(afterEnter).toContain('\n- ');

    // Ctrl+Z で元に戻す
    await page.keyboard.press('Control+Z');
    const restored = await page.inputValue(EDITOR);
    expect(restored).toBe(initial);
  });

  test('チェックボックストグル: プレビューのチェック操作を Ctrl+Z で元に戻せる', async ({ page }) => {
    await page.goto('/');

    const initial = '- [ ] タスク1\n- [ ] タスク2';
    // チェックボックス描画のためプレビューレンダリングを発火
    await setEditorValue(page, initial, { triggerPreview: true });

    // プレビューにチェックボックスが描画されるのを待つ
    await page.waitForSelector('#preview input[type="checkbox"]');

    // 1番目のチェックボックスをクリック
    const firstCheckbox = page.locator('#preview input[type="checkbox"]').first();
    await firstCheckbox.click();
    await page.waitForTimeout(50);

    // エディタ値に [x] が含まれることを確認
    const afterCheck = await page.inputValue(EDITOR);
    expect(afterCheck).toContain('[x]');

    // エディタにフォーカスを戻してから Ctrl+Z
    await page.focus(EDITOR);
    await page.keyboard.press('Control+Z');

    const restored = await page.inputValue(EDITOR);
    expect(restored).toBe(initial);
  });

});
