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
  const toc = document.getElementById('toc');
  const toolbar = document.getElementById('toolbar');
  const exportPdfBtn = document.getElementById('export-pdf');
  const exportHtmlBtn = document.getElementById('export-html');
  const saveMdBtn = document.getElementById('save-md');
  const openMdBtn = document.getElementById('open-md');
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
    insertImageBtn.addEventListener('click', () => {
      imageInput.click();
    });
  }

  if (openMdBtn && markdownInput) {
    openMdBtn.addEventListener('click', () => {
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
        updateTOCHighlight();

        const resetScrollPositions = () => {
          editor.scrollTop = 0;
          Layout.syncEditorHighlightScroll();
          preview.scrollTop = 0;
          if (toc) {
            toc.scrollTop = 0;
          }
        };

        resetScrollPositions();
        requestAnimationFrame(resetScrollPositions);
        Bus.emit('preview:manual-reset');

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
        updateTOCHighlight();

        const resetScrollPositions = () => {
          editor.scrollTop = 0;
          Layout.syncEditorHighlightScroll();
          preview.scrollTop = 0;
          if (toc) {
            toc.scrollTop = 0;
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
    updateLineNumberButtonLabel();
  });

  let headings = [];
  let tocItems = [];
  let headingPositions = [];
  let headingInfoById = new Map();
  let cursorHeadingHighlightId = null;
  let pendingHeadingAlignmentId = null;
  let pendingHeadingHighlightId = null;
  let editorMeasurementElement = null;
  let hasUserActivatedHeadingHighlight = false;

  const markHeadingHighlightActivation = () => {
    if (hasUserActivatedHeadingHighlight) {
      return;
    }
    hasUserActivatedHeadingHighlight = true;
    document.removeEventListener('pointerdown', markHeadingHighlightActivation, true);
    document.removeEventListener('keydown', markHeadingHighlightActivation, true);
    document.removeEventListener('touchstart', markHeadingHighlightActivation, true);
  };

  document.addEventListener('pointerdown', markHeadingHighlightActivation, true);
  document.addEventListener('keydown', markHeadingHighlightActivation, true);
  document.addEventListener('touchstart', markHeadingHighlightActivation, true);

  Preview.init();
  adjustTOCPosition();

  let formattingMenuElement = null;
  let formattingBoldButton = null;
  let formattingExternalLinkButton = null;
  let formattingCopyButton = null;
  let formattingCutButton = null;
  let formattingPasteButton = null;
  let clipboardReadSupported = false;
  let clipboardHasText = false;
  let clipboardReadRequestId = 0;
  let formattingMenuVisible = false;

  function getNavigatorClipboard() {
    if (typeof navigator === 'undefined' || !navigator) {
      return null;
    }
    return navigator.clipboard || null;
  }

  function updateClipboardButtonStates() {
    const button = formattingPasteButton;
    const enabled = clipboardReadSupported && clipboardHasText;
    if (!button) {
      return;
    }
    button.disabled = !enabled;
    if (enabled) {
      button.removeAttribute('aria-disabled');
    } else {
      button.setAttribute('aria-disabled', 'true');
    }
  }

  function refreshClipboardState() {
    const clipboard = getNavigatorClipboard();
    const canRead = Boolean(clipboard && typeof clipboard.readText === 'function');
    clipboardReadSupported = canRead;
    clipboardHasText = false;
    updateClipboardButtonStates();

    if (!canRead) {
      return;
    }

    const requestId = ++clipboardReadRequestId;
    clipboard
      .readText()
      .then(text => {
        if (requestId !== clipboardReadRequestId) {
          return;
        }
        clipboardHasText = typeof text === 'string' && text.length > 0;
        updateClipboardButtonStates();
      })
      .catch(error => {
        if (requestId !== clipboardReadRequestId) {
          return;
        }
        clipboardHasText = false;
        if (error && error.name === 'NotAllowedError') {
          clipboardReadSupported = false;
        }
        updateClipboardButtonStates();
      });
  }

  async function readClipboardText() {
    const clipboard = getNavigatorClipboard();
    if (!clipboard || typeof clipboard.readText !== 'function') {
      clipboardReadSupported = false;
      clipboardHasText = false;
      updateClipboardButtonStates();
      return '';
    }

    try {
      const text = await clipboard.readText();
      clipboardReadSupported = true;
      clipboardHasText = typeof text === 'string' && text.length > 0;
      updateClipboardButtonStates();
      return typeof text === 'string' ? text : '';
    } catch (error) {
      clipboardHasText = false;
      if (error && error.name === 'NotAllowedError') {
        clipboardReadSupported = false;
      }
      updateClipboardButtonStates();
      return '';
    }
  }

  // Use execCommand('insertText') to push edits onto the browser's native undo stack.
  // execCommand is deprecated but remains the only practical textarea undo integration;
  // migrate to EditContext API when it gains broad textarea support.
  function replaceEditorRange(start, end, text) {
    try {
      editor.focus({ preventScroll: true });
    } catch (_) {
      editor.focus();
    }
    editor.selectionStart = start;
    editor.selectionEnd = end;
    const ok = document.execCommand('insertText', false, text);
    if (!ok) {
      editor.value = editor.value.slice(0, start) + text + editor.value.slice(end);
    }
  }

  function insertTextAtCursor(text) {
    if (!editor || typeof text !== 'string') {
      return;
    }

    const value = editor.value || '';
    const start = Math.min(editor.selectionStart || 0, editor.selectionEnd || 0);
    const end = Math.max(editor.selectionStart || 0, editor.selectionEnd || 0);
    const previousScrollTop = editor.scrollTop;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const nextValue = `${before}${text}${after}`;
    const nextCaret = before.length + text.length;

    replaceEditorRange(start, end, text);
    editor.scrollTop = previousScrollTop;
    editor.selectionStart = nextCaret;
    editor.selectionEnd = nextCaret;

    Layout.updateEditorHighlight(nextValue);
    AppState.setText(nextValue, 'editor');
    Layout.updateLineNumbers();

    try {
      editor.focus({ preventScroll: true });
    } catch (error) {
      editor.focus();
    }
  }

  function normalizePlainTextValue(text) {
    if (typeof text !== 'string') {
      return '';
    }
    return text.replace(/\r\n?/g, '\n');
  }

  async function pasteClipboardText() {
    if (!editor) {
      return;
    }

    const clipboardText = await readClipboardText();
    if (!clipboardText) {
      return;
    }

    const textToInsert = normalizePlainTextValue(clipboardText);

    insertTextAtCursor(textToInsert);
    hideFormattingMenu();
  }

  function getEditorSelectionLength() {
    if (!editor) {
      return 0;
    }
    return Math.abs(editor.selectionEnd - editor.selectionStart);
  }

  function updateFormattingMenuState() {
    if (formattingBoldButton) {
      if (formattingBoldButton.disabled) {
        formattingBoldButton.disabled = false;
      }
      if (formattingBoldButton.getAttribute('aria-disabled') !== null) {
        formattingBoldButton.removeAttribute('aria-disabled');
      }
    }

    if (formattingExternalLinkButton) {
      if (formattingExternalLinkButton.disabled) {
        formattingExternalLinkButton.disabled = false;
      }
      if (formattingExternalLinkButton.getAttribute('aria-disabled') !== null) {
        formattingExternalLinkButton.removeAttribute('aria-disabled');
      }
    }

    const hasSelection = getEditorSelectionLength() > 0;

    if (formattingCopyButton) {
      formattingCopyButton.disabled = !hasSelection;
      if (hasSelection) {
        formattingCopyButton.removeAttribute('aria-disabled');
      } else {
        formattingCopyButton.setAttribute('aria-disabled', 'true');
      }
    }

    if (formattingCutButton) {
      formattingCutButton.disabled = !hasSelection;
      if (hasSelection) {
        formattingCutButton.removeAttribute('aria-disabled');
      } else {
        formattingCutButton.setAttribute('aria-disabled', 'true');
      }
    }

    updateClipboardButtonStates();
  }

  function hideFormattingMenu() {
    if (!formattingMenuElement || !formattingMenuVisible) {
      return;
    }
    formattingMenuElement.classList.remove('visible');
    formattingMenuElement.style.visibility = '';
    formattingMenuElement.style.left = '';
    formattingMenuElement.style.top = '';
    formattingMenuElement.setAttribute('aria-hidden', 'true');
    formattingMenuVisible = false;
  }

  function showFormattingMenu(clientX, clientY) {
    if (!formattingMenuElement) {
      return;
    }

    refreshClipboardState();
    updateFormattingMenuState();

    const scrollX = window.pageXOffset || window.scrollX || 0;
    const scrollY = window.pageYOffset || window.scrollY || 0;
    const viewportPadding = 8;

    let targetLeft = scrollX + clientX;
    let targetTop = scrollY + clientY;

    formattingMenuElement.classList.add('visible');
    formattingMenuElement.style.visibility = 'hidden';
    formattingMenuElement.style.left = `${targetLeft}px`;
    formattingMenuElement.style.top = `${targetTop}px`;

    const rect = formattingMenuElement.getBoundingClientRect();
    const viewportRight = scrollX + window.innerWidth;
    const viewportBottom = scrollY + window.innerHeight;

    if (rect.right > viewportRight - viewportPadding) {
      targetLeft = Math.max(
        scrollX + viewportPadding,
        viewportRight - rect.width - viewportPadding
      );
    }
    if (rect.bottom > viewportBottom - viewportPadding) {
      targetTop = Math.max(
        scrollY + viewportPadding,
        viewportBottom - rect.height - viewportPadding
      );
    }
    if (targetLeft < scrollX + viewportPadding) {
      targetLeft = scrollX + viewportPadding;
    }
    if (targetTop < scrollY + viewportPadding) {
      targetTop = scrollY + viewportPadding;
    }

    formattingMenuElement.style.left = `${targetLeft}px`;
    formattingMenuElement.style.top = `${targetTop}px`;
    formattingMenuElement.style.visibility = 'visible';
    formattingMenuElement.setAttribute('aria-hidden', 'false');
    formattingMenuVisible = true;
  }

  function applyInlineCodeFormatting() {
    if (!editor) {
      return;
    }

    const start = editor.selectionStart;
    const end = editor.selectionEnd;

    if (typeof start !== 'number' || typeof end !== 'number') {
      return;
    }

    const selectionStart = Math.min(start, end);
    const selectionEnd = Math.max(start, end);
    const previousValue = editor.value || '';
    const selectedText = previousValue.slice(selectionStart, selectionEnd);
    const prevScrollTop = editor.scrollTop;

    let nextValue = previousValue;
    let nextSelectionStart = selectionStart;
    let nextSelectionEnd = selectionEnd;
    let replacement = '';

    if (selectionStart === selectionEnd) {
      replacement = '``';
      nextValue =
        previousValue.slice(0, selectionStart) +
        replacement +
        previousValue.slice(selectionEnd);
      nextSelectionStart = selectionStart + 1;
      nextSelectionEnd = nextSelectionStart;
    } else if (
      selectedText.startsWith('`') &&
      selectedText.endsWith('`') &&
      selectedText.length >= 2
    ) {
      replacement = selectedText.slice(1, -1);
      nextValue =
        previousValue.slice(0, selectionStart) +
        replacement +
        previousValue.slice(selectionEnd);
      nextSelectionEnd = nextSelectionStart + replacement.length;
    } else {
      replacement = `\`${selectedText.replace(/\r?\n/g, ' ')}\``;
      nextValue =
        previousValue.slice(0, selectionStart) +
        replacement +
        previousValue.slice(selectionEnd);
      nextSelectionStart = selectionStart;
      nextSelectionEnd = selectionStart + replacement.length;
    }

    replaceEditorRange(selectionStart, selectionEnd, replacement);
    editor.scrollTop = prevScrollTop;
    editor.selectionStart = nextSelectionStart;
    editor.selectionEnd = nextSelectionEnd;

    Layout.updateEditorHighlight(nextValue);
    AppState.setText(nextValue, 'editor');
    Layout.updateLineNumbers();

    try {
      editor.focus({ preventScroll: true });
    } catch (error) {
      editor.focus();
    }
  }

  function applyExternalLinkFormatting() {
    if (!editor) {
      return;
    }

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    if (typeof start !== 'number' || typeof end !== 'number') {
      return;
    }

    const selectionStart = Math.min(start, end);
    const selectionEnd = Math.max(start, end);
    const previousValue = editor.value || '';
    const selectedText = previousValue.slice(selectionStart, selectionEnd);
    const prevScrollTop = editor.scrollTop;

    let nextValue = previousValue;
    let nextSelectionStart = selectionStart;
    let nextSelectionEnd = selectionEnd;
    let replacement = '';

    if (selectionStart === selectionEnd) {
      replacement = '[]()';
      nextValue =
        previousValue.slice(0, selectionStart) +
        replacement +
        previousValue.slice(selectionEnd);
      nextSelectionStart = selectionStart + 1;
      nextSelectionEnd = nextSelectionStart;
    } else {
      replacement = `[${selectedText}]()`;
      nextValue =
        previousValue.slice(0, selectionStart) +
        replacement +
        previousValue.slice(selectionEnd);
      nextSelectionStart = selectionStart + selectedText.length + 3;
      nextSelectionEnd = nextSelectionStart;
    }

    replaceEditorRange(selectionStart, selectionEnd, replacement);
    editor.scrollTop = prevScrollTop;
    editor.selectionStart = nextSelectionStart;
    editor.selectionEnd = nextSelectionEnd;

    Layout.updateEditorHighlight(nextValue);
    AppState.setText(nextValue, 'editor');
    Layout.updateLineNumbers();

    try {
      editor.focus({ preventScroll: true });
    } catch (error) {
      editor.focus();
    }
  }

  function applyBoldFormatting() {
    if (!editor) {
      return;
    }
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    if (typeof start !== 'number' || typeof end !== 'number') {
      return;
    }

    const selectionStart = Math.min(start, end);
    const selectionEnd = Math.max(start, end);
    const previousValue = editor.value || '';
    const selectedText = previousValue.slice(selectionStart, selectionEnd);
    const prevScrollTop = editor.scrollTop;

    let nextValue = previousValue;
    let nextSelectionStart = selectionStart;
    let nextSelectionEnd = selectionEnd;
    let replacement = '';

    if (selectionStart === selectionEnd) {
      replacement = '****';
      nextValue =
        previousValue.slice(0, selectionStart) +
        replacement +
        previousValue.slice(selectionEnd);
      nextSelectionStart = selectionStart + 2;
      nextSelectionEnd = nextSelectionStart;
    } else if (
      selectedText.startsWith('**') &&
      selectedText.endsWith('**') &&
      selectedText.length >= 4
    ) {
      replacement = selectedText.slice(2, -2);
      nextValue =
        previousValue.slice(0, selectionStart) +
        replacement +
        previousValue.slice(selectionEnd);
      nextSelectionEnd = nextSelectionStart + replacement.length;
    } else {
      replacement = `**${selectedText}**`;
      nextValue =
        previousValue.slice(0, selectionStart) +
        replacement +
        previousValue.slice(selectionEnd);
      nextSelectionEnd = nextSelectionStart + replacement.length;
    }

    replaceEditorRange(selectionStart, selectionEnd, replacement);
    editor.scrollTop = prevScrollTop;
    editor.selectionStart = nextSelectionStart;
    editor.selectionEnd = nextSelectionEnd;

    Layout.updateEditorHighlight(nextValue);
    AppState.setText(nextValue, 'editor');
    Layout.updateLineNumbers();

    try {
      editor.focus({ preventScroll: true });
    } catch (error) {
      editor.focus();
    }
  }

  function copyEditorSelection() {
    if (!editor) {
      return;
    }

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    if (typeof start !== 'number' || typeof end !== 'number') {
      return;
    }

    const selectionStart = Math.min(start, end);
    const selectionEnd = Math.max(start, end);
    if (selectionStart === selectionEnd) {
      return;
    }

    const selectedText = (editor.value || '').slice(selectionStart, selectionEnd);
    if (!selectedText) {
      return;
    }

    const collapseSelection = () => {
      editor.selectionStart = selectionEnd;
      editor.selectionEnd = selectionEnd;
    };

    const attemptExecCommandCopy = () => {
      const activeElement = document.activeElement;
      try {
        try {
          editor.focus({ preventScroll: true });
        } catch (focusError) {
          editor.focus();
        }
        document.execCommand('copy');
      } catch (error) {
        // Ignore copy errors to avoid interrupting the user experience.
      } finally {
        collapseSelection();
        if (
          activeElement &&
          activeElement !== editor &&
          typeof activeElement.focus === 'function'
        ) {
          activeElement.focus();
        }
      }
    };

    const clipboard =
      typeof navigator !== 'undefined' && navigator ? navigator.clipboard : undefined;

    if (clipboard && typeof clipboard.writeText === 'function') {
      clipboard
        .writeText(selectedText)
        .then(() => {
          if (clipboard && typeof clipboard.readText === 'function') {
            clipboardReadSupported = true;
            clipboardHasText = true;
            updateClipboardButtonStates();
          }
          collapseSelection();
        })
        .catch(attemptExecCommandCopy);
    } else {
      attemptExecCommandCopy();
    }
  }

  function cutEditorSelection() {
    if (!editor) {
      return;
    }

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    if (typeof start !== 'number' || typeof end !== 'number') {
      return;
    }

    const selectionStart = Math.min(start, end);
    const selectionEnd = Math.max(start, end);
    if (selectionStart === selectionEnd) {
      return;
    }

    const selectedText = (editor.value || '').slice(selectionStart, selectionEnd);
    if (!selectedText) {
      return;
    }

    const removeSelection = () => {
      const value = editor.value || '';
      const before = value.slice(0, selectionStart);
      const after = value.slice(selectionEnd);
      const nextValue = `${before}${after}`;
      const nextCaret = before.length;

      replaceEditorRange(selectionStart, selectionEnd, '');
      editor.selectionStart = nextCaret;
      editor.selectionEnd = nextCaret;

      Layout.updateEditorHighlight(nextValue);
      AppState.setText(nextValue, 'editor');
      Layout.updateLineNumbers();

      try {
        editor.focus({ preventScroll: true });
      } catch (error) {
        editor.focus();
      }
    };

    const attemptExecCommandCopy = () => {
      const activeElement = document.activeElement;
      try {
        try {
          editor.focus({ preventScroll: true });
        } catch (focusError) {
          editor.focus();
        }
        document.execCommand('copy');
      } catch (error) {
        // Ignore copy errors to avoid interrupting the user experience.
      } finally {
        if (
          activeElement &&
          activeElement !== editor &&
          typeof activeElement.focus === 'function'
        ) {
          activeElement.focus();
        }
      }
    };

    const clipboard =
      typeof navigator !== 'undefined' && navigator ? navigator.clipboard : undefined;

    if (clipboard && typeof clipboard.writeText === 'function') {
      clipboard
        .writeText(selectedText)
        .then(() => {
          if (clipboard && typeof clipboard.readText === 'function') {
            clipboardReadSupported = true;
            clipboardHasText = true;
            updateClipboardButtonStates();
          }
          removeSelection();
        })
        .catch(() => {
          attemptExecCommandCopy();
          removeSelection();
        });
    } else {
      attemptExecCommandCopy();
      removeSelection();
    }
  }

  function handleEditorContextMenu(event) {
    if (!editor) {
      return;
    }
    event.preventDefault();
    showFormattingMenu(event.clientX, event.clientY);
  }

  function handleEditorMouseUp(event) {
    if (event.button !== 0) {
      return;
    }
    if (getEditorSelectionLength() === 0) {
      hideFormattingMenu();
    }
  }

  function handleEditorSelect() {
    updateFormattingMenuState();
    if (formattingMenuVisible && getEditorSelectionLength() === 0) {
      hideFormattingMenu();
    }
  }

  function handleEditorBlur(event) {
    if (
      formattingMenuElement &&
      event &&
      event.relatedTarget &&
      formattingMenuElement.contains(event.relatedTarget)
    ) {
      return;
    }
    hideFormattingMenu();
  }

  function handleDocumentPointerDown(event) {
    if (!formattingMenuVisible || !formattingMenuElement) {
      return;
    }
    if (formattingMenuElement.contains(event.target)) {
      return;
    }
    hideFormattingMenu();
  }

  function handleDocumentScroll() {
    hideFormattingMenu();
  }

  function handleDocumentKeyDown(event) {
    if (event.key === 'Escape') {
      hideFormattingMenu();
    }
  }

  function initializeFormattingMenu() {
    if (!editor || formattingMenuElement) {
      return;
    }

    const menu = document.createElement('div');
    menu.id = 'formatting-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-hidden', 'true');

    const boldButton = document.createElement('button');
    boldButton.type = 'button';
    boldButton.className = 'formatting-menu-button';
    boldButton.dataset.action = 'bold';
    boldButton.dataset.i18n = 'formatting.bold';
    boldButton.setAttribute('role', 'menuitem');
    boldButton.textContent = i18n.t('formatting.bold');
    boldButton.addEventListener('click', () => {
      applyBoldFormatting();
      hideFormattingMenu();
    });

    const inlineCodeButton = document.createElement('button');
    inlineCodeButton.type = 'button';
    inlineCodeButton.className = 'formatting-menu-button';
    inlineCodeButton.dataset.action = 'inline-code';
    inlineCodeButton.dataset.i18n = 'formatting.inlineCode';
    inlineCodeButton.setAttribute('role', 'menuitem');
    inlineCodeButton.textContent = i18n.t('formatting.inlineCode');
    inlineCodeButton.addEventListener('click', () => {
      applyInlineCodeFormatting();
      hideFormattingMenu();
    });

    const externalLinkButton = document.createElement('button');
    externalLinkButton.type = 'button';
    externalLinkButton.className = 'formatting-menu-button';
    externalLinkButton.dataset.action = 'external-link';
    externalLinkButton.dataset.i18n = 'formatting.externalLink';
    externalLinkButton.setAttribute('role', 'menuitem');
    externalLinkButton.textContent = i18n.t('formatting.externalLink');
    externalLinkButton.addEventListener('click', () => {
      applyExternalLinkFormatting();
      hideFormattingMenu();
    });

    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'formatting-menu-button';
    copyButton.dataset.action = 'copy';
    copyButton.dataset.i18n = 'formatting.copy';
    copyButton.setAttribute('role', 'menuitem');
    copyButton.textContent = i18n.t('formatting.copy');
    copyButton.addEventListener('click', () => {
      copyEditorSelection();
      hideFormattingMenu();
    });

    const cutButton = document.createElement('button');
    cutButton.type = 'button';
    cutButton.className = 'formatting-menu-button';
    cutButton.dataset.action = 'cut';
    cutButton.dataset.i18n = 'formatting.cut';
    cutButton.setAttribute('role', 'menuitem');
    cutButton.textContent = i18n.t('formatting.cut');
    cutButton.addEventListener('click', () => {
      cutEditorSelection();
      hideFormattingMenu();
    });

    const pasteButton = document.createElement('button');
    pasteButton.type = 'button';
    pasteButton.className = 'formatting-menu-button';
    pasteButton.dataset.action = 'paste';
    pasteButton.dataset.i18n = 'formatting.paste';
    pasteButton.setAttribute('role', 'menuitem');
    pasteButton.textContent = i18n.t('formatting.paste');
    pasteButton.disabled = true;
    pasteButton.setAttribute('aria-disabled', 'true');
    pasteButton.addEventListener('click', () => {
      pasteClipboardText();
    });

    menu.appendChild(boldButton);
    menu.appendChild(inlineCodeButton);
    menu.appendChild(externalLinkButton);
    menu.appendChild(copyButton);
    menu.appendChild(cutButton);
    menu.appendChild(pasteButton);
    document.body.appendChild(menu);
    i18n.applyToDOM(menu);

    formattingMenuElement = menu;
    formattingBoldButton = boldButton;
    formattingExternalLinkButton = externalLinkButton;
    formattingCopyButton = copyButton;
    formattingCutButton = cutButton;
    formattingPasteButton = pasteButton;

    updateFormattingMenuState();

    editor.addEventListener('contextmenu', handleEditorContextMenu);
    editor.addEventListener('mouseup', handleEditorMouseUp);
    editor.addEventListener('select', handleEditorSelect);
    editor.addEventListener('blur', handleEditorBlur);

    document.addEventListener('mousedown', handleDocumentPointerDown, true);
    document.addEventListener('scroll', handleDocumentScroll, true);
    document.addEventListener('keydown', handleDocumentKeyDown, true);
    window.addEventListener('resize', hideFormattingMenu);
  }

  initializeFormattingMenu();

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
    Layout.updateLineNumbers();
    Layout.syncLineNumberScroll();
    Preview.render(text);
    buildTOC();
    updateTOCHighlight();
  }

  function buildTOC() {
    const raw = AppState.getText();
    const globalWindow = typeof window !== 'undefined' ? window : undefined;
    const slugger =
      globalWindow &&
      globalWindow.Slug &&
      typeof globalWindow.Slug.createGenerator === 'function'
        ? globalWindow.Slug.createGenerator()
        : (() => {
            const counts = Object.create(null);
            return text => {
              let source = typeof text === 'string' ? text : '';
              try {
                source = source.normalize('NFKD');
              } catch (error) {
                // ignore unsupported normalize
              }
              const base = source
                .toLowerCase()
                .replace(/\p{M}+/gu, '')
                .trim()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/-{2,}/g, '-')
                .replace(/^-+|-+$/g, '') || 'section';
              const current = counts[base] || 0;
              counts[base] = current + 1;
              return current ? `${base}-${current}` : base;
            };
          })();
    headingPositions = [];
    headingInfoById = new Map();
    cursorHeadingHighlightId = null;

    // Collect heading lines while ignoring fenced code blocks
    const lines = raw.split('\n');
    let index = 0;
    let inCode = false;
    for (const line of lines) {
      const fence = line.match(/^```/);
      if (fence) {
        inCode = !inCode;
        index += line.length + 1;
        continue;
      }
      if (!inCode) {
        const m = line.match(/^(#{1,5})\s+(.*)$/);
        if (m) {
          const level = m[1].length;
          const text = m[2].trim();
          const id = slugger(text);
          const headingLength = line.length;
          const info = {
            level,
            text,
            id,
            start: index,
            end: index + headingLength
          };
          headingPositions.push(info);
          headingInfoById.set(id, info);
        }
      }
      index += line.length + 1;
    }

    const headingElements = Array.from(
      preview.querySelectorAll('h1, h2, h3, h4, h5')
    );
    headingElements.forEach((h, i) => {
      if (headingPositions[i]) {
        h.id = headingPositions[i].id;
      }
    });

    const root = document.createElement('ul');
    const stack = [root];
    let currentLevel = 1;

    headingPositions.forEach(({ level, text, id }) => {
      if (level > currentLevel) {
        for (let i = currentLevel; i < level; i++) {
          const ul = document.createElement('ul');
          const lastLi = stack[stack.length - 1].lastElementChild;
          if (lastLi) {
            lastLi.appendChild(ul);
          } else {
            stack[stack.length - 1].appendChild(ul);
          }
          stack.push(ul);
        }
      } else if (level < currentLevel) {
        for (let i = currentLevel; i > level; i--) {
          stack.pop();
        }
      }

      const li = document.createElement('li');
      li.className = 'toc-item';
      li.dataset.target = id;
      li.textContent = text;
      stack[stack.length - 1].appendChild(li);

      currentLevel = level;
    });

    toc.innerHTML = '';
    toc.appendChild(root);

    tocItems = toc.querySelectorAll('.toc-item');
    headings = headingElements;

    tocItems.forEach(item => {
      item.addEventListener('click', e => {
        e.stopPropagation();
        const targetId = item.dataset.target;
        if (!targetId) {
          return;
        }

        Bus.emit('toc:jump', { id: targetId });
      });
    });

    updateTOCHighlight();
  }

  function getHeadingInfoAtPosition(position) {
    if (!headingPositions.length) {
      return null;
    }

    for (const info of headingPositions) {
      const start = Number.isFinite(info.start) ? info.start : 0;
      const end = Number.isFinite(info.end) && info.end >= start ? info.end : start;
      if (position < start) {
        break;
      }
      if (position >= start && position < end) {
        return info;
      }
    }

    return null;
  }

  function updateCursorHeadingHighlight() {
    if (!editor) {
      cursorHeadingHighlightId = null;
      return null;
    }

    const start = Number.isFinite(editor.selectionStart) ? editor.selectionStart : 0;
    const end = Number.isFinite(editor.selectionEnd) ? editor.selectionEnd : start;
    const anchor = Math.min(start, end);
    const focus = Math.max(start, end);
    const isCollapsed = anchor === focus;

    if (!isCollapsed) {
      cursorHeadingHighlightId = null;
      return null;
    }

    const headingInfo = getHeadingInfoAtPosition(anchor);
    if (!headingInfo) {
      cursorHeadingHighlightId = null;
      return null;
    }

    if (!hasUserActivatedHeadingHighlight) {
      cursorHeadingHighlightId = null;
      return headingInfo;
    }

    if (cursorHeadingHighlightId === headingInfo.id) {
      return headingInfo;
    }

    cursorHeadingHighlightId = headingInfo.id;
    Layout.flashEditorHeading(headingInfo);
    if (
      hasUserActivatedHeadingHighlight &&
      Preview &&
      typeof Preview.highlightHeading === 'function'
    ) {
      Preview.highlightHeading(headingInfo.id);
    }

    return headingInfo;
  }

  function updateTOCHighlight() {
    if (!headingPositions.length) return;
    const start = Number.isFinite(editor.selectionStart) ? editor.selectionStart : 0;
    let currentId = headingPositions[0].id;
    for (const hp of headingPositions) {
      if (start >= hp.start) {
        currentId = hp.id;
      } else {
        break;
      }
    }
    tocItems.forEach(item => {
      item.classList.toggle('active', item.dataset.target === currentId);
    });
    updateCursorHeadingHighlight();
  }

  function ensureEditorMeasurementElement() {
    if (editorMeasurementElement && editorMeasurementElement.isConnected) {
      return editorMeasurementElement;
    }
    const measure = document.createElement('div');
    measure.setAttribute('aria-hidden', 'true');
    measure.style.position = 'absolute';
    measure.style.visibility = 'hidden';
    measure.style.pointerEvents = 'none';
    measure.style.whiteSpace = 'pre-wrap';
    measure.style.wordWrap = 'break-word';
    measure.style.top = '0';
    measure.style.left = '-9999px';
    measure.style.height = 'auto';
    measure.style.minHeight = '0';
    measure.style.maxHeight = 'none';
    editorMeasurementElement = measure;
    document.body.appendChild(editorMeasurementElement);
    return editorMeasurementElement;
  }

  const MEASUREMENT_STYLE_PROPS = [
    'box-sizing',
    'width',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'border-top-width',
    'border-right-width',
    'border-bottom-width',
    'border-left-width',
    'border-top-style',
    'border-right-style',
    'border-bottom-style',
    'border-left-style',
    'font-family',
    'font-size',
    'font-style',
    'font-variant',
    'font-weight',
    'line-height',
    'letter-spacing',
    'text-indent',
    'text-transform',
    'text-decoration',
    'tab-size',
    'word-break',
    'word-spacing'
  ];

  function applyEditorMeasurementStyles(target) {
    if (!editor) {
      return null;
    }
    const styles = window.getComputedStyle(editor);
    MEASUREMENT_STYLE_PROPS.forEach(prop => {
      const value = styles.getPropertyValue(prop);
      if (value) {
        target.style.setProperty(prop, value);
      } else {
        target.style.removeProperty(prop);
      }
    });
    target.style.overflow = 'visible';
    target.style.height = 'auto';
    target.style.minHeight = '0';
    target.style.maxHeight = 'none';
    return styles;
  }

  function parsePixelValue(styles, property) {
    if (!styles || typeof styles.getPropertyValue !== 'function') {
      return 0;
    }
    const value = styles.getPropertyValue(property);
    if (typeof value !== 'string' || !value.trim()) {
      return 0;
    }
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function measureEditorContentBefore(position) {
    if (!editor || typeof position !== 'number' || position < 0) {
      return null;
    }
    const measurement = ensureEditorMeasurementElement();
    const styles = applyEditorMeasurementStyles(measurement);
    if (!styles) {
      return null;
    }
    const value = editor.value || '';
    const clampedPosition = Math.min(position, value.length);
    const beforeText = value.slice(0, clampedPosition);
    measurement.textContent = beforeText;
    const marker = document.createElement('span');
    marker.textContent = '\u200b';
    measurement.appendChild(marker);
    const markerTop = marker.offsetTop;
    measurement.textContent = '';
    const paddingTop = parsePixelValue(styles, 'padding-top');
    return {
      height: Math.max(0, markerTop - paddingTop),
      paddingTop
    };
  }

  function applyEditorScrollTop(value) {
    if (!editor) {
      return;
    }
    editor.scrollTop = value;
    Layout.syncLineNumberScroll();
  }

  function animateEditorScrollTo(target) {
    if (!editor) {
      return;
    }

    const maxScroll = Math.max(editor.scrollHeight - editor.clientHeight, 0);
    const clampedTarget = Math.min(Math.max(target, 0), maxScroll);

    applyEditorScrollTop(clampedTarget);
  }

  function alignEditorScrollToHeading(position, previewDetail) {
    if (!editor) {
      return;
    }
    const measurement = measureEditorContentBefore(position);
    if (!measurement) {
      return;
    }
    const previewHeaderHeight =
      previewDetail && Number.isFinite(previewDetail.headerHeight)
        ? previewDetail.headerHeight
        : 0;
    const previewPaddingTop =
      previewDetail && Number.isFinite(previewDetail.paddingTop)
        ? previewDetail.paddingTop
        : 0;
    const desiredOffset = Math.max(
      measurement.paddingTop,
      previewHeaderHeight + previewPaddingTop
    );
    const targetScrollTop =
      measurement.paddingTop +
      measurement.height -
      desiredOffset;
    const maxScroll = Math.max(editor.scrollHeight - editor.clientHeight, 0);
    const clamped = Math.min(Math.max(0, targetScrollTop), maxScroll);
    animateEditorScrollTo(clamped);
  }

  function getPreviewScrollTargetForHeading(id) {
    if (!headings || !headings.length) {
      return null;
    }
    const headingElement = headings.find(h => h.id === id);
    if (!headingElement) {
      return null;
    }
    if (!Preview || typeof Preview.computeScrollTarget !== 'function') {
      return null;
    }
    try {
      return Preview.computeScrollTarget(headingElement);
    } catch (error) {
      console.warn('[TOC] Failed to compute preview scroll target for heading.', error);
      return null;
    }
  }

  function focusEditorOnHeading(headingInfo, previewDetail) {
    if (!editor || !headingInfo) {
      return;
    }
    const previousScrollTop = editor.scrollTop;
    let preventScrollWorked = false;
    if (typeof editor.focus === 'function') {
      try {
        editor.focus({ preventScroll: true });
        preventScrollWorked = true;
      } catch (error) {
        editor.focus();
      }
    }
    if (typeof editor.setSelectionRange === 'function') {
      editor.setSelectionRange(headingInfo.start, headingInfo.start);
    } else {
      editor.selectionStart = editor.selectionEnd = headingInfo.start;
    }
    if (!preventScrollWorked && editor.scrollTop !== previousScrollTop) {
      editor.scrollTop = previousScrollTop;
      Layout.syncLineNumberScroll();
    }
    updateTOCHighlight();
    alignEditorScrollToHeading(headingInfo.start, previewDetail);
  }

  editor.addEventListener('input', () => {
    hideFormattingMenu();
    Layout.stopEditorHeadingHighlight();
    AppState.setText(editor.value, 'editor');
    Layout.updateLineNumbers();
  });
  editor.addEventListener('scroll', () => {
    hideFormattingMenu();
    Layout.syncLineNumberScroll();
  });

  function continueListOnEnter(event) {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.isComposing
    ) {
      return false;
    }

    const { selectionStart, selectionEnd, value } = editor;

    if (selectionStart !== selectionEnd) {
      return false;
    }

    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const beforeCursor = value.slice(lineStart, selectionStart);
    const listMatch = beforeCursor.match(
      /^(\s*)([*+-]|\d+[.)])\s+(\[(?: |x|X)\]\s*)?/
    );

    if (!listMatch) {
      return false;
    }

    const nextNewlineIndex = value.indexOf('\n', selectionEnd);
    const afterCursorWithinLine =
      nextNewlineIndex === -1
        ? value.slice(selectionEnd)
        : value.slice(selectionEnd, nextNewlineIndex);
    const fullLineContent = beforeCursor + afterCursorWithinLine;
    const contentAfterMarker = fullLineContent.slice(listMatch[0].length);

    if (!contentAfterMarker.trim()) {
      return false;
    }

    event.preventDefault();

    const indent = listMatch[1] || '';
    const marker = listMatch[2];
    const hasCheckbox = Boolean(listMatch[3]);
    const orderedMatch = marker.match(/^(\d+)([.)])$/);
    let nextMarker = marker;
    if (orderedMatch) {
      const nextNumber = Number(orderedMatch[1]) + 1;
      nextMarker = `${nextNumber}${orderedMatch[2]}`;
    }

    const remainderRaw = value.slice(selectionEnd);
    const spaceOffset = remainderRaw.startsWith(' ') ? 1 : 0;
    const remainder = remainderRaw.slice(spaceOffset);

    const checkboxSegment = hasCheckbox ? '[ ] ' : '';
    const insertion = `\n${indent}${nextMarker} ${checkboxSegment}`;
    const newValue =
      value.slice(0, selectionStart) + insertion + remainder;

    const newCursorPos = selectionStart + insertion.length;
    const prevScrollTop = editor.scrollTop;

    replaceEditorRange(selectionStart, selectionStart + spaceOffset, insertion);
    editor.scrollTop = prevScrollTop;
    editor.selectionStart = editor.selectionEnd = newCursorPos;

    Layout.updateEditorHighlight(editor.value);
    AppState.setText(editor.value, 'editor');

    return true;
  }
  editor.addEventListener('keydown', event => {
    if (formattingMenuVisible) {
      const modifierKeys = ['Shift', 'Control', 'Alt', 'Meta'];
      if (!modifierKeys.includes(event.key)) {
        hideFormattingMenu();
      }
    }

    if (
      event.key === 'PageDown' ||
      event.key === 'PageUp' ||
      event.key === 'Home' ||
      event.key === 'End' ||
      ((event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
        (event.metaKey || event.ctrlKey))
    ) {
      return;
    }

    if (continueListOnEnter(event)) {
      return;
    }
  });
  editor.addEventListener('keyup', updateTOCHighlight);
  editor.addEventListener('click', updateTOCHighlight);

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
      replaceEditorRange(cursorPos, cursorPos, markdownImage);

      Layout.updateEditorHighlight(newValue);
      AppState.setText(newValue, 'editor');
    };
    reader.readAsDataURL(file);
  });

  Export.init({ preview, i18n, triggerDownloadFromBlob, AppState, exportPdfBtn, exportHtmlBtn, saveMdBtn });

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

  Bus.on('toc:jump', event => {
    if (!event || typeof event.id !== 'string') {
      return;
    }
    if (Preview && typeof Preview.clearHeadingHighlight === 'function') {
      Preview.clearHeadingHighlight();
    }
    pendingHeadingAlignmentId = event.id;
    pendingHeadingHighlightId = event.id;
    const headingInfo = headingInfoById.get(event.id);
    const previewDetail = getPreviewScrollTargetForHeading(event.id);
    if (headingInfo) {
      focusEditorOnHeading(headingInfo, previewDetail);
    }
    if (Preview && typeof Preview.scrollToHeading === 'function') {
      Preview.scrollToHeading(event.id);
    }
  });

  Bus.on('preview:scrolled', detail => {
    if (!detail || typeof detail.id !== 'string') {
      return;
    }
    const matchesAlignment =
      pendingHeadingAlignmentId && detail.id === pendingHeadingAlignmentId;
    const matchesHighlight =
      pendingHeadingHighlightId && detail.id === pendingHeadingHighlightId;
    if (!matchesAlignment && !matchesHighlight) {
      return;
    }

    const headingInfo = headingInfoById.get(detail.id);
    if (matchesAlignment) {
      pendingHeadingAlignmentId = null;
      if (headingInfo) {
        alignEditorScrollToHeading(headingInfo.start, detail);
      }
    }

    if (matchesHighlight) {
      pendingHeadingHighlightId = null;
      if (headingInfo && hasUserActivatedHeadingHighlight) {
        Layout.flashEditorHeading(headingInfo);
      }
      if (
        hasUserActivatedHeadingHighlight &&
        Preview &&
        typeof Preview.highlightHeading === 'function'
      ) {
        Preview.highlightHeading(detail.id);
      }
    }
  });

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
    }
  });

  AppState.init({
    text: editor.value,
    settings: { lang: i18n.getCurrentLang() }
  });

  const initialSettings = AppState.getSettings();
  Layout.applyLineNumbersEnabled(Boolean(initialSettings.showLineNumbers));

}

