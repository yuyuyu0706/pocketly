const { test, expect } = require('@playwright/test');

const VIEWPORT = { width: 1280, height: 1024 };

test.describe('File System Access API: save', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
  });

  test('performSave uses showSaveFilePicker on first save when API is available', async ({ page }) => {
    let pickerCalled = false;
    await page.addInitScript(() => {
      window.__mockWritable = {
        written: null,
        write(content) { this.written = content; return Promise.resolve(); },
        close() { return Promise.resolve(); },
      };
      window.__mockFileHandle = {
        createWritable() { return Promise.resolve(window.__mockWritable); },
      };
      window.showSaveFilePicker = async () => {
        window.__pickerCalled = true;
        return window.__mockFileHandle;
      };
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => {
      document.getElementById('editor').value = 'hello world';
      window.AppState.setText('hello world', 'editor');
    });

    await page.evaluate(() => Export.performSave());
    await page.waitForTimeout(100);

    const pickerCalledResult = await page.evaluate(() => window.__pickerCalled);
    expect(pickerCalledResult).toBe(true);

    const writtenContent = await page.evaluate(() => window.__mockWritable.written);
    expect(writtenContent).toBe('hello world');
  });

  test('performSave skips picker on second save (reuses stored handle)', async ({ page }) => {
    await page.addInitScript(() => {
      window.__pickerCallCount = 0;
      window.__mockWritable = {
        write() { return Promise.resolve(); },
        close() { return Promise.resolve(); },
      };
      window.__mockFileHandle = {
        createWritable() { return Promise.resolve(window.__mockWritable); },
      };
      window.showSaveFilePicker = async () => {
        window.__pickerCallCount++;
        return window.__mockFileHandle;
      };
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => Export.performSave());
    await page.waitForTimeout(100);
    await page.evaluate(() => Export.performSave());
    await page.waitForTimeout(100);

    const count = await page.evaluate(() => window.__pickerCallCount);
    expect(count).toBe(1);
  });

  test('fallback to blob download when File System Access API is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      delete window.showSaveFilePicker;
      window.__downloadTriggered = false;
      // Intercept the anchor click to detect download
      const origCreate = document.createElement.bind(document);
      document.createElement = function(tag) {
        const el = origCreate(tag);
        if (tag === 'a') {
          const origClick = el.click.bind(el);
          el.click = function() {
            if (el.download) window.__downloadTriggered = true;
            origClick();
          };
        }
        return el;
      };
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => Export.performSave());
    await page.waitForTimeout(200);

    const triggered = await page.evaluate(() => window.__downloadTriggered);
    expect(triggered).toBe(true);
  });

  test('Ctrl+S triggers performSave', async ({ page }) => {
    await page.addInitScript(() => {
      window.__performSaveCalled = false;
      window.__mockWritable = {
        write() { return Promise.resolve(); },
        close() { return Promise.resolve(); },
      };
      window.__mockFileHandle = {
        createWritable() { return Promise.resolve(window.__mockWritable); },
      };
      window.showSaveFilePicker = async () => window.__mockFileHandle;
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const originalPerformSave = await page.evaluate(() => typeof Export.performSave);
    expect(originalPerformSave).toBe('function');

    await page.evaluate(() => {
      const orig = Export.performSave;
      Export.performSave = function() { window.__performSaveCalled = true; return orig(); };
    });

    await page.keyboard.press('Control+s');
    await page.waitForTimeout(100);

    const called = await page.evaluate(() => window.__performSaveCalled);
    expect(called).toBe(true);
  });

  test('Ctrl+S does not trigger browser save dialog (event is prevented)', async ({ page }) => {
    await page.addInitScript(() => {
      window.__defaultPrevented = false;
      window.__mockWritable = {
        write() { return Promise.resolve(); },
        close() { return Promise.resolve(); },
      };
      window.__mockFileHandle = {
        createWritable() { return Promise.resolve(window.__mockWritable); },
      };
      window.showSaveFilePicker = async () => window.__mockFileHandle;
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Register AFTER app initializes so it fires after app's handler (same bubbling phase, FIFO order)
    await page.evaluate(() => {
      document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          window.__defaultPrevented = e.defaultPrevented;
        }
      });
    });

    await page.keyboard.press('Control+s');
    await page.waitForTimeout(100);

    const prevented = await page.evaluate(() => window.__defaultPrevented);
    expect(prevented).toBe(true);
  });

  test('setFileHandle stores handle used for subsequent save without picker', async ({ page }) => {
    await page.addInitScript(() => {
      window.__pickerCalled = false;
      window.__mockWritable = {
        written: null,
        write(c) { this.written = c; return Promise.resolve(); },
        close() { return Promise.resolve(); },
      };
      window.__externalHandle = {
        createWritable() { return Promise.resolve(window.__mockWritable); },
      };
      window.showSaveFilePicker = async () => { window.__pickerCalled = true; return window.__externalHandle; };
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => {
      window.AppState.setText('from open file', 'editor');
      Export.setFileHandle(window.__externalHandle);
    });

    await page.evaluate(() => Export.performSave());
    await page.waitForTimeout(100);

    const pickerCalled = await page.evaluate(() => window.__pickerCalled);
    expect(pickerCalled).toBe(false);

    const written = await page.evaluate(() => window.__mockWritable.written);
    expect(written).toBe('from open file');
  });

  test('cancelling the picker does not trigger blob download fallback', async ({ page }) => {
    await page.addInitScript(() => {
      window.__downloadTriggered = false;
      window.showSaveFilePicker = async () => {
        const err = new DOMException('The user aborted a request.', 'AbortError');
        throw err;
      };
      const origCreate = document.createElement.bind(document);
      document.createElement = function(tag) {
        const el = origCreate(tag);
        if (tag === 'a') {
          const origClick = el.click.bind(el);
          el.click = function() {
            if (el.download) window.__downloadTriggered = true;
            origClick();
          };
        }
        return el;
      };
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => Export.performSave());
    await page.waitForTimeout(200);

    const triggered = await page.evaluate(() => window.__downloadTriggered);
    expect(triggered).toBe(false);
  });

  test('save button shows unsaved indicator after editor input', async ({ page }) => {
    await page.addInitScript(() => {
      window.__mockWritable = {
        write() { return Promise.resolve(); },
        close() { return Promise.resolve(); },
      };
      window.__mockFileHandle = {
        createWritable() { return Promise.resolve(window.__mockWritable); },
      };
      window.showSaveFilePicker = async () => window.__mockFileHandle;
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const btnBefore = await page.locator('#save-md').textContent();
    expect(btnBefore).not.toContain('unsaved');
    expect(btnBefore).not.toContain('未保存');

    await page.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.value += 'x';
      ed.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(100);

    const btnAfter = await page.locator('#save-md').textContent();
    expect(btnAfter).toMatch(/unsaved|未保存/);
  });

  test('save button clears unsaved indicator after successful save', async ({ page }) => {
    await page.addInitScript(() => {
      window.__mockWritable = {
        write() { return Promise.resolve(); },
        close() { return Promise.resolve(); },
      };
      window.__mockFileHandle = {
        createWritable() { return Promise.resolve(window.__mockWritable); },
      };
      window.showSaveFilePicker = async () => window.__mockFileHandle;
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.value += 'x';
      ed.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(100);

    const btnDirty = await page.locator('#save-md').textContent();
    expect(btnDirty).toMatch(/unsaved|未保存/);

    await page.evaluate(() => Export.performSave());
    await page.waitForTimeout(200);

    const btnClean = await page.locator('#save-md').textContent();
    expect(btnClean).not.toContain('unsaved');
    expect(btnClean).not.toContain('未保存');
  });

  test('cancelling picker does not change unsaved indicator', async ({ page }) => {
    await page.addInitScript(() => {
      window.showSaveFilePicker = async () => {
        throw new DOMException('The user aborted a request.', 'AbortError');
      };
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.value += 'x';
      ed.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(100);

    const btnDirty = await page.locator('#save-md').textContent();
    expect(btnDirty).toMatch(/unsaved|未保存/);

    await page.evaluate(() => Export.performSave());
    await page.waitForTimeout(200);

    const btnStillDirty = await page.locator('#save-md').textContent();
    expect(btnStillDirty).toMatch(/unsaved|未保存/);
  });
});
