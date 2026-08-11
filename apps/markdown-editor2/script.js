async function bootstrap() {
  await i18n.init();
  startApp();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}

function startApp() {
  const editor = document.getElementById('editor');
  let editorPane = document.getElementById('editor-pane');
  let lineNumberGutter = document.getElementById('line-number-gutter');
  const preview = document.getElementById('preview');
  const divider = document.getElementById('divider');
  const tocDivider = document.getElementById('toc-divider');
  const mainContainer = document.querySelector('main');
  const imageInput = document.getElementById('imageInput');
  const insertImageBtn = document.getElementById('insert-image');
  const tocPanel = document.getElementById('toc');
  const toc = document.getElementById('toc-headings');
  const fileTreeEl = document.getElementById('file-tree');
  const toolbar = document.getElementById('toolbar');
  const exportPdfBtn = document.getElementById('export-pdf');
  const exportHtmlBtn = document.getElementById('export-html');
  const saveMdBtn = document.getElementById('save-md');
  const openMdBtn = document.getElementById('open-md');
  const openFolderBtn = document.getElementById('open-folder');
  const helpBtn = document.getElementById('help-btn');
  const helpWindow = document.getElementById('help-window');
  const helpClose = document.getElementById('help-close');
  const templateBtn = document.getElementById('template-btn');
  const templateOptions = document.getElementById('template-options');
  const markdownInput = document.getElementById('markdownInput');
  const toggleLineNumbersBtn = document.getElementById('toggle-line-numbers');
  const langSwitch = document.getElementById('lang-switch');
  if (editor) {
    if (!editorPane) {
      editorPane = document.createElement('div');
      editorPane.id = 'editor-pane';
      if (editor.parentNode) {
        editor.parentNode.insertBefore(editorPane, editor);
      }
      editorPane.appendChild(editor);
    } else if (!editorPane.contains(editor)) {
      editorPane.appendChild(editor);
    }

    if (!lineNumberGutter) {
      lineNumberGutter = document.createElement('div');
      lineNumberGutter.id = 'line-number-gutter';
      lineNumberGutter.setAttribute('aria-hidden', 'true');
    }

    if (editorPane && lineNumberGutter.parentElement !== editorPane) {
      editorPane.insertBefore(lineNumberGutter, editorPane.firstChild);
    }
  }

  function triggerDownloadFromBlob(blob, filename) {
    if (!(blob instanceof Blob)) {
      throw new TypeError('A Blob instance is required to download content.');
    }

    const globalWindow = typeof window !== 'undefined' ? window : undefined;
    const urlApi =
      (globalWindow && (globalWindow.URL || globalWindow.webkitURL)) ||
      (typeof URL !== 'undefined' ? URL : undefined);
    if (!urlApi || typeof urlApi.createObjectURL !== 'function') {
      throw new Error('URL.createObjectURL is not supported in this environment.');
    }

    const safeName = typeof filename === 'string' && filename.trim()
      ? filename.trim()
      : 'download';

    const downloadUrl = urlApi.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    anchor.download = safeName;
    anchor.style.display = 'none';

    const parent = document.body || document.documentElement;
    parent.appendChild(anchor);

    const triggerClick = () => {
      anchor.click();
      parent.removeChild(anchor);
      setTimeout(() => {
        urlApi.revokeObjectURL(downloadUrl);
      }, 0);
    };

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(triggerClick);
    } else {
      setTimeout(triggerClick, 0);
    }
  }

  const templates = [
    { key: 'templates.meetingNotes', path: 'template/meeting-notes.md' },
    { key: 'templates.systemChangeOverview', path: 'template/system-change-overview.md' },
    { key: 'templates.systemChangeChecklist', path: 'template/system-change-checklist.md' },
    { key: 'templates.readme', path: 'template/readme.md' },
    { key: 'templates.releaseNotes', path: 'template/release-notes.md' }
  ];

  const updateDocumentTitle = () => {
    document.title = i18n.t('app.title');
  };

  updateDocumentTitle();

  if (langSwitch) {
    langSwitch.value = i18n.getCurrentLang();
    langSwitch.addEventListener('change', event => {
      const nextLang = event.target.value;
      i18n.setLang(nextLang);
      AppState.setSetting('lang', nextLang);
    });
  }

  if (insertImageBtn && imageInput) {
    insertImageBtn.addEventListener('click', async () => {
      await closePiPBeforeNativeAction();
      imageInput.click();
    });
  }

  let _isDirty = false;

  function updateSaveBtnLabel() {
    if (!saveMdBtn) return;
    const base = i18n.t('toolbar.save');
    saveMdBtn.textContent = _isDirty ? base + i18n.t('toolbar.saveUnsaved') : base;
  }

  function applyLoadedContent(result) {
    // Group B: intentional direct assignment — full-document sync on file load.
    // execCommand would pollute the undo stack with the entire loaded content as a single entry.
    editor.value = result;
    editor.selectionStart = editor.selectionEnd = 0;

    Layout.updateEditorHighlight(result);
    if (typeof editor.focus === 'function') {
      try {
        editor.focus({ preventScroll: true });
      } catch (err) {
        editor.focus();
      }
    }

    AppState.setText(result, 'editor');
    adjustTOCPosition();
    Toc.updateTOCHighlight();

    const resetScrollPositions = () => {
      editor.scrollTop = 0;
      Layout.syncEditorHighlightScroll();
      preview.scrollTop = 0;
      if (tocPanel) {
        tocPanel.scrollTop = 0;
      }
    };

    resetScrollPositions();
    requestAnimationFrame(resetScrollPositions);
    Bus.emit('preview:manual-reset');
    _isDirty = false;
    updateSaveBtnLabel();
  }

  if (openMdBtn && markdownInput) {
    openMdBtn.addEventListener('click', async () => {
      if (typeof window.showOpenFilePicker === 'function') {
        try {
          await closePiPBeforeNativeAction();
          const [fileHandle] = await window.showOpenFilePicker({
            types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'], 'text/plain': ['.md', '.txt'] } }],
          });
          Export.setFileHandle(fileHandle);
          const file = await fileHandle.getFile();
          const result = await file.text();
          applyLoadedContent(result);
          return;
        } catch (err) {
          console.warn('[Open] showOpenFilePicker failed, falling back to input.', err);
        }
      }
      await closePiPBeforeNativeAction();
      markdownInput.click();
    });

    markdownInput.addEventListener('change', event => {
      const [file] = event.target.files || [];
      if (!file) {
        return;
      }

      const reader = new FileReader();

      reader.onload = loadEvent => {
        const { result } = loadEvent.target || {};
        if (typeof result !== 'string') {
          markdownInput.value = '';
          return;
        }

        applyLoadedContent(result);
        markdownInput.value = '';
      };

      reader.onerror = () => {
        console.error(i18n.t('dialogs.fileReadErrorLog'));
        alert(i18n.t('dialogs.fileReadErrorAlert'));
        markdownInput.value = '';
      };

      reader.readAsText(file, 'utf-8');
    });
  }

  if (openFolderBtn && window.Directory) {
    openFolderBtn.addEventListener('click', async () => {
      await closePiPBeforeNativeAction();
      const result = await Directory.openFolder();
      if (!result.opened && result.reason === 'unsupported') {
        // MEW-031 (unsupported-browser fallback) is not implemented yet, so we
        // silently no-op here for now; disabling the button etc. is MEW-031's scope.
        console.warn('[App] showDirectoryPicker is not supported in this browser.');
      }
    });
  }

  let templateButtons = [];
  let currentTemplateIndex = -1;
  let closeTemplateMenu = () => {};

  function buildTemplateOptions() {
    if (!templateOptions) {
      templateButtons = [];
      return;
    }

    templateOptions.innerHTML = '';
    templateButtons = [];

  templates.forEach(({ key, path }) => {
    const optionBtn = document.createElement('button');
    optionBtn.type = 'button';
    optionBtn.className = 'template-option';
    optionBtn.dataset.path = path;
    optionBtn.dataset.i18n = key;
    optionBtn.setAttribute('role', 'menuitem');
    templateOptions.appendChild(optionBtn);
    templateButtons.push(optionBtn);
    i18n.applyToDOM(optionBtn);
  });

  i18n.applyToDOM(templateOptions);
}

  if (templateBtn && templateOptions) {
    buildTemplateOptions();

    const focusOption = index => {
      if (!templateButtons.length) return;
      const normalizedIndex =
        (index + templateButtons.length) % templateButtons.length;
      const option = templateButtons[normalizedIndex];
      if (option) {
        option.focus();
        currentTemplateIndex = normalizedIndex;
      }
    };

    const openTemplateMenu = (startIndex = 0) => {
      if (!templateButtons.length) return;
      templateOptions.hidden = false;
      templateBtn.setAttribute('aria-expanded', 'true');
      focusOption(startIndex);
    };

    const closeMenu = () => {
      if (templateOptions.hidden) return;
      templateOptions.hidden = true;
      templateBtn.setAttribute('aria-expanded', 'false');
      currentTemplateIndex = -1;
    };

    const applyTemplate = async templatePath => {
      if (!templatePath) return;

      if (editor.value.trim() && !confirm(i18n.t('dialogs.replaceTemplate'))) {
        return;
      }

      try {
        const response = await fetch(templatePath);
        if (!response.ok) {
          throw new Error(`Failed to load template: ${response.status}`);
        }
        const text = await response.text();
        // Group B: intentional direct assignment — full-document sync on template apply.
        // execCommand would pollute the undo stack with the entire template as a single entry.
        editor.value = text;
        editor.selectionStart = editor.selectionEnd = 0;

        Layout.updateEditorHighlight(text);
        if (typeof editor.focus === 'function') {
          try {
            editor.focus({ preventScroll: true });
          } catch (err) {
            editor.focus();
          }
        }

        AppState.setText(text, 'editor');
        adjustTOCPosition();
        Toc.updateTOCHighlight();

        const resetScrollPositions = () => {
          editor.scrollTop = 0;
          Layout.syncEditorHighlightScroll();
          preview.scrollTop = 0;
          if (tocPanel) {
            tocPanel.scrollTop = 0;
          }
        };

        resetScrollPositions();
        requestAnimationFrame(resetScrollPositions);
        Bus.emit('preview:manual-reset');
      } catch (error) {
        console.error(i18n.t('dialogs.templateLoadErrorLog'), error);
        alert(i18n.t('dialogs.templateLoadErrorAlert'));
      }
    };

    templateBtn.addEventListener('click', () => {
      if (templateOptions.hidden) {
        openTemplateMenu();
      } else {
        closeMenu();
      }
    });

    templateBtn.addEventListener('keydown', event => {
      if (
        event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'Enter' ||
        event.key === ' ' ||
        event.key === 'Spacebar'
      ) {
        event.preventDefault();
        if (templateOptions.hidden) {
          const startIndex =
            event.key === 'ArrowUp' && templateButtons.length
              ? templateButtons.length - 1
              : 0;
          openTemplateMenu(startIndex);
        }
      } else if (event.key === 'Escape' && !templateOptions.hidden) {
        event.preventDefault();
        closeMenu();
      }
    });

    templateOptions.addEventListener('focusin', event => {
      const option = event.target.closest('.template-option');
      if (!option) return;
      currentTemplateIndex = templateButtons.indexOf(option);
    });

    templateOptions.addEventListener('keydown', event => {
      if (!templateButtons.length) return;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          focusOption(currentTemplateIndex + 1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          focusOption(currentTemplateIndex - 1);
          break;
        case 'Home':
          event.preventDefault();
          focusOption(0);
          break;
        case 'End':
          event.preventDefault();
          focusOption(templateButtons.length - 1);
          break;
        case 'Escape':
          event.preventDefault();
          closeMenu();
          templateBtn.focus();
          break;
        case 'Tab':
          closeMenu();
          break;
        default:
          break;
      }
    });

    templateOptions.addEventListener('click', event => {
      const option = event.target.closest('.template-option');
      if (!option) return;
      event.stopPropagation();
      closeMenu();
      applyTemplate(option.dataset.path);
    });

    document.addEventListener('click', event => {
      if (
        templateOptions.hidden ||
        templateOptions.contains(event.target) ||
        templateBtn.contains(event.target)
      ) {
        return;
      }
      closeMenu();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !templateOptions.hidden) {
        closeMenu();
        templateBtn.focus();
      }
    });

    closeTemplateMenu = closeMenu;
  }

  document.addEventListener('i18n:change', () => {
    AppState.setSetting('lang', i18n.getCurrentLang());
    updateDocumentTitle();
    if (langSwitch) {
      langSwitch.value = i18n.getCurrentLang();
    }
    if (templateBtn && templateOptions) {
      closeTemplateMenu();
      buildTemplateOptions();
    }
    adjustTOCPosition();
    Layout.updateLineNumberButtonLabel();
    updateSaveBtnLabel();
  });

  Preview.init();
  adjustTOCPosition();

  Formatting.init({ editor, i18n, Layout, AppState });


  Layout.init({
    editor,
    editorPane,
    lineNumberGutter,
    mainContainer,
    toc,
    tocDivider,
    divider,
    toggleLineNumbersBtn,
    i18n,
    AppState,
  });

  function getHeaderOffset() {
    return toolbar ? toolbar.offsetHeight : 0;
  }

  function adjustTOCPosition() {
    const offset = getHeaderOffset();
    document.documentElement.style.setProperty('--header-offset', offset + 'px');
  }

  window.addEventListener('resize', () => {
    adjustTOCPosition();
    Layout.onResize();
  });

  // Lv2-5: debounce the heavy render pipeline (Preview.render/Toc.buildTOC/
  // Toc.updateTOCHighlight) for editor keystrokes only, so typing doesn't run a
  // full pipeline per character. Shorter than TEXT_SAVE_DEBOUNCE(300ms) to keep
  // preview feel responsive. Non-editor sources (Directory switch, checkbox
  // toggle, etc.) still render immediately.
  const RENDER_DEBOUNCE = 200;
  let renderDebounceTimer = null;

  function scheduleHeavyRenderWork(text) {
    Preview.render(text);
    Toc.buildTOC();
    Toc.updateTOCHighlight();
  }

  // Update preview and expand stored Base64 images
  function handleTextStateChange(event) {
    if (!event || typeof event.text !== 'string') {
      return;
    }

    const { text, source } = event;
    const prevSelectionStart = editor.selectionStart;
    const prevSelectionEnd = editor.selectionEnd;
    const prevScrollTop = editor.scrollTop;

    if (source !== 'editor' && editor.value !== text) {
      // Group B: intentional direct assignment — full-document sync driven by Bus 'text:changed'.
      // This fires on checkbox toggle and language switch; using execCommand for the whole document
      // would coarsen undo granularity and destabilise selection/scroll position restoration.
      editor.value = text;
      if (source === 'init') {
        editor.selectionStart = editor.selectionEnd = 0;
        editor.scrollTop = 0;
      } else {
        editor.selectionStart = prevSelectionStart;
        editor.selectionEnd = prevSelectionEnd;
        editor.scrollTop = prevScrollTop;
      }
    }
    Layout.updateEditorHighlight(text);
    Layout.scheduleUpdateLineNumbers();
    Layout.syncLineNumberScroll();

    if (source === 'editor') {
      clearTimeout(renderDebounceTimer);
      renderDebounceTimer = setTimeout(() => scheduleHeavyRenderWork(text), RENDER_DEBOUNCE);
    } else {
      clearTimeout(renderDebounceTimer);
      scheduleHeavyRenderWork(text);
    }
  }

  editor.addEventListener('input', () => {
    Formatting.hideFormattingMenu();
    Layout.stopEditorHeadingHighlight();
    AppState.setText(editor.value, 'editor');
    Layout.scheduleUpdateLineNumbers();
    _isDirty = true;
    updateSaveBtnLabel();
  });
  editor.addEventListener('scroll', () => {
    Formatting.hideFormattingMenu();
    Layout.syncLineNumberScroll();
  });

  editor.addEventListener('keydown', event => {
    Formatting.onEditorKeydown(event);
  });
  editor.addEventListener('keyup', Toc.updateTOCHighlight);
  editor.addEventListener('click', Toc.updateTOCHighlight);

  imageInput.addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result;
      const filename = file.name.trim();
      if (typeof base64 === 'string' && filename) {
        Bus.emit('preview:image', { filename, data: base64 });
      }

      const markdownImage = i18n.t('image.markdownTemplate', { filename });
      const cursorPos = editor.selectionStart;
      const currentValue = AppState.getText();
      const newValue =
        currentValue.slice(0, cursorPos) +
        markdownImage +
        currentValue.slice(cursorPos);
      Formatting.replaceEditorRange(cursorPos, cursorPos, markdownImage);

      Layout.updateEditorHighlight(newValue);
      AppState.setText(newValue, 'editor');
    };
    reader.readAsDataURL(file);
  });

  Export.init({ preview, i18n, triggerDownloadFromBlob, AppState, exportPdfBtn, exportHtmlBtn, saveMdBtn, closePiPBeforeNativeAction, onSaveSuccess: () => { _isDirty = false; updateSaveBtnLabel(); } });

  function onCtrlS(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      Export.performSave();
    }
  }

  document.addEventListener('keydown', onCtrlS);

  helpBtn.addEventListener('click', () => {
    helpWindow.classList.toggle('hidden');
  });

  helpClose.addEventListener('click', () => {
    helpWindow.classList.add('hidden');
  });

  if (toggleLineNumbersBtn) {
    toggleLineNumbersBtn.addEventListener('click', () => {
      Layout.setLineNumbersEnabled(!Layout.isLineNumbersEnabled());
    });
  }

  Bus.on('text:changed', handleTextStateChange);

  Toc.init({ editor, toc, preview, AppState, Bus, Preview, Layout });

  if (fileTreeEl && window.FileTree && window.Directory) {
    FileTree.init({ container: fileTreeEl, Directory, Bus, AppState });
  }

  Bus.on('settings:changed', event => {
    if (!event || typeof event.key !== 'string') {
      return;
    }
    if (event.key === 'lang') {
      if (langSwitch && typeof event.value === 'string') {
        langSwitch.value = event.value;
      }
    } else if (event.key === 'showLineNumbers') {
      Layout.applyLineNumbersEnabled(Boolean(event.value));
    } else if (event.key === 'mode') {
      applyMode(event.value);
    }
  });

  const toggleModeBtn = document.getElementById('toggle-mode');
  const editorDragHandle = document.getElementById('editor-drag-handle');
  const editorCloseBtn = document.getElementById('editor-close-btn');
  const editorCopyBtn = document.getElementById('editor-copy-btn');

  let _pipWindow = null;

  async function closePiPBeforeNativeAction() {
    if (!_pipWindow) {
      return;
    }
    const winToClose = _pipWindow;
    await new Promise(resolve => {
      winToClose.addEventListener('pagehide', resolve, { once: true });
      winToClose.close();
    });
  }

  // --- PiP window persistence ---
  const PIP_WINDOW_KEY = 'md:layout:pipWindow';
  const PIP_WINDOW_DEFAULTS = { width: 800, height: 600 };

  function readPipWindowGeometry() {
    try {
      const raw = localStorage.getItem(PIP_WINDOW_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return Object.assign({}, PIP_WINDOW_DEFAULTS, parsed);
        }
      }
    } catch (e) {
      // ignore
    }
    return Object.assign({}, PIP_WINDOW_DEFAULTS);
  }

  function writePipWindowGeometry(geom) {
    try {
      localStorage.setItem(PIP_WINDOW_KEY, JSON.stringify(geom));
    } catch (e) {
      // ignore
    }
  }

  function getPipRequestOptions() {
    const geom = readPipWindowGeometry();
    return { width: geom.width, height: geom.height, disallowReturnToOpener: true };
  }

  // Expose for testing
  window.__pipWindowGeometry = { read: readPipWindowGeometry, write: writePipWindowGeometry, getRequestOptions: getPipRequestOptions };

  // --- Floating panel persistence (separate from md:settings which resets on reload) ---
  const FLOATING_PANEL_KEY = 'md:layout:floatingPanel';
  const FLOATING_PANEL_DEFAULTS = { left: 780, top: 120, height: 450 };

  function readFloatingPanelGeometry() {
    try {
      const raw = localStorage.getItem(FLOATING_PANEL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return Object.assign({}, FLOATING_PANEL_DEFAULTS, parsed);
        }
      }
    } catch (e) {
      // ignore
    }
    return Object.assign({}, FLOATING_PANEL_DEFAULTS);
  }

  function writeFloatingPanelGeometry(geom) {
    try {
      localStorage.setItem(FLOATING_PANEL_KEY, JSON.stringify(geom));
    } catch (e) {
      // ignore
    }
  }

  // --- Floating panel: drag ---
  let _isDraggingPanel = false;
  let _panelDragStartX = 0;
  let _panelDragStartY = 0;
  let _panelDragStartLeft = 0;
  let _panelDragStartTop = 0;

  function applyFloatingPanelGeometry() {
    if (!editorPane) return;
    const g = readFloatingPanelGeometry();
    editorPane.style.left = g.left + 'px';
    editorPane.style.top = g.top + 'px';
    editorPane.style.height = g.height + 'px';
    Layout.restoreEditorWidthRatio();
  }

  function saveFloatingPanelGeometry() {
    if (!editorPane) return;
    const rect = editorPane.getBoundingClientRect();
    writeFloatingPanelGeometry({
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      height: Math.round(rect.height),
    });
  }

  if (editorCloseBtn) {
    editorCloseBtn.addEventListener('mousedown', e => {
      e.stopPropagation();
    });
    editorCloseBtn.addEventListener('click', () => {
      if (toggleModeBtn) {
        toggleModeBtn.click();
      }
    });
  }

  if (editorCopyBtn) {
    const copyIconHTML = editorCopyBtn.innerHTML;
    const checkIconHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    window.__copyBtnTest = { getCopyIconHTML: () => copyIconHTML, getCheckIconHTML: () => checkIconHTML, getBtn: () => editorCopyBtn };
    let feedbackTimer = null;
    editorCopyBtn.addEventListener('mousedown', e => e.stopPropagation());
    editorCopyBtn.addEventListener('click', async () => {
      const text = editor.value;
      const ownerWin = (editor.ownerDocument && editor.ownerDocument.defaultView) || window;
      const showSuccess = () => {
        editorCopyBtn.innerHTML = checkIconHTML;
        editorCopyBtn.classList.add('copy-success');
        if (feedbackTimer) clearTimeout(feedbackTimer);
        feedbackTimer = setTimeout(() => {
          editorCopyBtn.innerHTML = copyIconHTML;
          editorCopyBtn.classList.remove('copy-success');
          feedbackTimer = null;
        }, 1000);
      };
      try {
        await ownerWin.navigator.clipboard.writeText(text);
        showSuccess();
      } catch (err) {
        const ownerDoc = editor.ownerDocument || document;
        editor.focus();
        editor.select();
        ownerDoc.execCommand('copy');
        showSuccess();
      }
    });
  }

  if (editorDragHandle && editorPane) {
    editorDragHandle.addEventListener('mousedown', e => {
      _isDraggingPanel = true;
      _panelDragStartX = e.clientX;
      _panelDragStartY = e.clientY;
      const rect = editorPane.getBoundingClientRect();
      _panelDragStartLeft = rect.left;
      _panelDragStartTop = rect.top;
      editorPane.classList.add('panel-dragging');
      e.preventDefault();
    });
  }

  document.addEventListener('mousemove', e => {
    if (!_isDraggingPanel) return;
    const dx = e.clientX - _panelDragStartX;
    const dy = e.clientY - _panelDragStartY;
    editorPane.style.left = (_panelDragStartLeft + dx) + 'px';
    editorPane.style.top = (_panelDragStartTop + dy) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!_isDraggingPanel) return;
    _isDraggingPanel = false;
    editorPane.classList.remove('panel-dragging');
    saveFloatingPanelGeometry();
  });

  // --- Floating panel: resize (native CSS resize) ---
  if (editorPane && typeof ResizeObserver !== 'undefined') {
    const _panelRO = new ResizeObserver(() => {
      if (!_isDraggingPanel && !Layout.isDraggingDivider() && document.body.dataset.mode === 'edit') {
        if (_pipWindow) {
          writePipWindowGeometry({
            width: _pipWindow.innerWidth,
            height: _pipWindow.innerHeight,
          });
        } else {
          saveFloatingPanelGeometry();
          Layout.persistEditorWidthRatio();
        }
      }
    });
    _panelRO.observe(editorPane);
  }

  function buildPipStyleText() {
    return [
      'body { margin:0; height:100vh; overflow:hidden; }',
      '#editor-pane {',
      '  position:static !important; width:100% !important; height:100vh !important;',
      '  box-shadow:none !important; border:none !important; border-radius:0 !important;',
      '  resize:none !important; min-width:0 !important; min-height:0 !important;',
      '  padding-top:28px !important; display:flex !important;',
      '}',
    ].join('\n');
  }
  // Expose for testing
  window.__pipStyleTest = { build: buildPipStyleText };

  async function applyMode(mode) {
    const isEdit = mode === 'edit';
    const setModeAttributes = edit => {
      document.body.dataset.mode = edit ? 'edit' : 'read';
      if (toggleModeBtn) {
        toggleModeBtn.textContent = edit ? '👁 Read' : '✏️ Edit';
        toggleModeBtn.setAttribute('aria-pressed', String(edit));
      }
    };

    if (!isEdit) {
      setModeAttributes(false);
      if (_pipWindow) {
        _pipWindow.close();
        _pipWindow = null;
      }
      Layout.setFloating(false);
      return;
    }

    if (Layout.isDocumentPiPSupported()) {
      try {
        const requestPromise = documentPictureInPicture.requestWindow(getPipRequestOptions());
        let timedOut = false;
        const pipWin = await Promise.race([
          requestPromise,
          new Promise((_, reject) =>
            setTimeout(() => { timedOut = true; reject(new Error('requestWindow timed out')); }, 3000)
          ),
        ]);
        requestPromise.then(win => { if (timedOut && win) win.close(); }).catch(() => {});
        _pipWindow = pipWin;

        const link = pipWin.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = new URL(`app.css?v=${Date.now()}`, document.baseURI).href;
        pipWin.document.head.appendChild(link);
        await new Promise(resolve => {
          link.addEventListener('load', resolve, { once: true });
          link.addEventListener('error', resolve, { once: true });
        });

        const pipStyle = pipWin.document.createElement('style');
        pipStyle.textContent = buildPipStyleText();
        pipWin.document.head.appendChild(pipStyle);

        pipWin.document.body.classList.add('pip-mode');

        if (editor) {
          editor.style.width = '';
        }

        const pipPlaceholder = document.createElement('div');
        pipPlaceholder.id = '_pip-placeholder';
        pipPlaceholder.style.display = 'none';
        if (editorPane.parentNode) {
          editorPane.parentNode.insertBefore(pipPlaceholder, editorPane);
        }
        const formattingMenuEl = Formatting.getFormattingMenuElement();
        pipWin.document.body.appendChild(editorPane);
        if (formattingMenuEl) {
          pipWin.document.body.appendChild(formattingMenuEl);
        }
        setModeAttributes(true);
        Layout.setPiPMode(true);

        pipWin.document.addEventListener('keydown', onCtrlS);

        pipWin.addEventListener('pagehide', () => {
          _pipWindow = null;
          Layout.setPiPMode(false);
          if (formattingMenuEl && formattingMenuEl.ownerDocument !== document) {
            document.body.appendChild(formattingMenuEl);
          }
          if (pipPlaceholder.parentNode) {
            pipPlaceholder.parentNode.insertBefore(editorPane, pipPlaceholder);
            pipPlaceholder.remove();
          }
          AppState.setSetting('mode', 'read');
        });

        Layout.setFloating(false);
        Layout.syncEditorHighlightPadding();
        Layout.updateEditorHighlight(editor ? editor.value : '');
        Layout.updateLineNumbers();
        Toc.updateTOCHighlight();
        return;
      } catch (err) {
        console.warn('[PiP] requestWindow failed, falling back to floating panel:', err);
        _pipWindow = null;
      }
    }
    // Fallback: floating panel
    setModeAttributes(true);
    Layout.setFloating(true);
    applyFloatingPanelGeometry();
    Layout.syncEditorHighlightPadding();
    Layout.updateEditorHighlight(editor ? editor.value : '');
    Layout.updateLineNumbers();
    Toc.updateTOCHighlight();
  }

  if (toggleModeBtn) {
    toggleModeBtn.addEventListener('click', () => {
      const current = AppState.getSettings().mode;
      AppState.setSetting('mode', current === 'edit' ? 'read' : 'edit');
    });
  }

  AppState.init({
    text: editor.value,
    settings: { lang: i18n.getCurrentLang() }
  });

  const initialSettings = AppState.getSettings();
  Layout.applyLineNumbersEnabled(Boolean(initialSettings.showLineNumbers));
  applyMode(initialSettings.mode);

  const reconnectBanner = document.getElementById('reconnect-banner');
  const reconnectBannerMessage = document.getElementById('reconnect-banner-message');
  const reconnectBannerReconnect = document.getElementById('reconnect-banner-reconnect');
  const reconnectBannerClose = document.getElementById('reconnect-banner-close');

  if (reconnectBanner && reconnectBannerMessage && reconnectBannerReconnect && reconnectBannerClose && window.Directory) {
    reconnectBannerClose.addEventListener('click', () => {
      reconnectBanner.classList.add('hidden');
    });

    reconnectBannerReconnect.addEventListener('click', async () => {
      const result = await Directory.reconnectFolder();
      if (result.opened) {
        reconnectBanner.classList.add('hidden');
      }
    });

    Directory.checkForReconnectableFolder().then(folder => {
      if (!folder) {
        return;
      }
      reconnectBannerMessage.textContent = i18n.t('reconnect.message', { name: folder.name });
      reconnectBanner.classList.remove('hidden');
    });
  }
}

