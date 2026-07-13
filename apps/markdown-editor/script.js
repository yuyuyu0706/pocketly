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
  let editorContentContainer = document.getElementById('editor-content-container');
  let editorHighlightElement = document.getElementById('editor-highlight');
  let editorHighlightContent =
    editorHighlightElement &&
    editorHighlightElement.querySelector('.editor-highlight-content');
  let lastHighlightMarkup = null;
  const HIGHLIGHT_PLACEHOLDER = '&#8203;';
  const HIGHLIGHT_START_TOKEN = '\uF111';
  const HIGHLIGHT_END_TOKEN = '\uF112';
  const HEADING_FLASH_DURATION = 2000;
  const HEADING_FLASH_FADE_DURATION = 600;
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

  let editorHeadingFlashTimeout = null;
  let editorHeadingFadeTimeout = null;
  let isEditorHeadingFading = false;
  let editorHeadingHighlightRange = null;

  function ensureEditorHighlightStructure() {
    if (!editor) {
      return false;
    }

    if (!editorContentContainer || !editorContentContainer.isConnected) {
      const existingContainer = document.getElementById('editor-content-container');
      if (existingContainer) {
        editorContentContainer = existingContainer;
      } else {
        const container = document.createElement('div');
        container.id = 'editor-content-container';
        container.className = 'editor-content-container';
        editorContentContainer = container;
      }
    }

    if (editorPane && editorContentContainer.parentElement !== editorPane) {
      editorPane.appendChild(editorContentContainer);
    }

    if (editorContentContainer && !editorContentContainer.contains(editor)) {
      editorContentContainer.appendChild(editor);
    }

    if (!editorHighlightElement || !editorHighlightElement.isConnected) {
      const existingHighlight = document.getElementById('editor-highlight');
      if (existingHighlight) {
        editorHighlightElement = existingHighlight;
      } else {
        const highlight = document.createElement('div');
        highlight.id = 'editor-highlight';
        highlight.setAttribute('aria-hidden', 'true');
        editorHighlightElement = highlight;
      }
    }

    if (!editorHighlightContent || !editorHighlightElement.contains(editorHighlightContent)) {
      let highlightContent =
        editorHighlightElement.querySelector('.editor-highlight-content');
      if (!highlightContent) {
        highlightContent = document.createElement('div');
        highlightContent.className = 'editor-highlight-content';
        editorHighlightElement.innerHTML = '';
        editorHighlightElement.appendChild(highlightContent);
      }
      editorHighlightContent = highlightContent;
    }

    if (
      editorContentContainer &&
      editorHighlightElement &&
      !editorContentContainer.contains(editorHighlightElement)
    ) {
      if (editorHighlightElement.parentElement) {
        editorHighlightElement.parentElement.removeChild(editorHighlightElement);
      }
      editorContentContainer.insertBefore(
        editorHighlightElement,
        editorContentContainer.firstChild
      );
    }

    if (editorHighlightElement) {
      editorHighlightElement.style.setProperty(
        '--heading-flash-fade-duration',
        `${HEADING_FLASH_FADE_DURATION}ms`
      );
    }

    return Boolean(editorHighlightContent);
  }

  function prefersReducedMotion() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (error) {
      console.warn('[Accessibility] Unable to determine reduced motion preference.', error);
      return false;
    }
  }

  function getEditorHeadingFlashElements() {
    if (!editorHighlightContent) {
      return [];
    }
    return Array.from(
      editorHighlightContent.querySelectorAll('.editor-heading-flash')
    );
  }

  function clearEditorHeadingFadeState() {
    const elements = getEditorHeadingFlashElements();
    for (const element of elements) {
      element.classList.remove('editor-heading-fade-out');
    }
    isEditorHeadingFading = false;
  }

  function clearEditorHeadingTimers() {
    if (editorHeadingFlashTimeout) {
      window.clearTimeout(editorHeadingFlashTimeout);
      editorHeadingFlashTimeout = null;
    }
    if (editorHeadingFadeTimeout) {
      window.clearTimeout(editorHeadingFadeTimeout);
      editorHeadingFadeTimeout = null;
    }
  }

  function stopEditorHeadingHighlight() {
    clearEditorHeadingTimers();
    clearEditorHeadingFadeState();
    if (editorHeadingHighlightRange) {
      editorHeadingHighlightRange = null;
    }
    lastHighlightMarkup = null;
    updateEditorHighlight(editor ? editor.value : '');
  }

  function syncEditorHighlightPadding() {
    if (!editor || !editorContentContainer) {
      return;
    }
    const styles = window.getComputedStyle(editor);
    if (!styles) {
      return;
    }
    const paddingSides = ['top', 'right', 'bottom', 'left'];
    for (const side of paddingSides) {
      const value = styles.getPropertyValue(`padding-${side}`);
      if (value) {
        editorContentContainer.style.setProperty(`--editor-padding-${side}`, value);
      }
    }
    const scrollbarWidth = Math.max(0, editor.offsetWidth - editor.clientWidth);
    editorContentContainer.style.setProperty(
      '--editor-scrollbar-width',
      `${scrollbarWidth}px`
    );
    const scrollbarHeight = Math.max(0, editor.offsetHeight - editor.clientHeight);
    editorContentContainer.style.setProperty(
      '--editor-scrollbar-height',
      `${scrollbarHeight}px`
    );
  }

  function escapeHighlightHtml(text) {
    return (text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildEditorHighlightMarkup(value, highlightRange) {
    const normalized = typeof value === 'string' ? value.replace(/\r\n?/g, '\n') : '';
    if (!normalized) {
      return HIGHLIGHT_PLACEHOLDER;
    }

    let working = normalized;
    if (
      highlightRange &&
      Number.isFinite(highlightRange.start) &&
      Number.isFinite(highlightRange.end)
    ) {
      const start = Math.max(0, Math.min(highlightRange.start, working.length));
      const end = Math.max(start, Math.min(highlightRange.end, working.length));
      if (end > start) {
        working =
          working.slice(0, start) +
          HIGHLIGHT_START_TOKEN +
          working.slice(start, end) +
          HIGHLIGHT_END_TOKEN +
          working.slice(end);
      }
    }

    const pattern = /\[([^\]]*?)\]\(([^)]*?)\)/g;
    let result = '';
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(working)) !== null) {
      const startIndex = match.index;
      const endIndex = pattern.lastIndex;
      result += escapeHighlightHtml(working.slice(lastIndex, startIndex));

      let isImageSyntax = false;
      let lookbehindIndex = startIndex - 1;
      while (lookbehindIndex >= 0) {
        const char = working.charAt(lookbehindIndex);
        if (char === HIGHLIGHT_START_TOKEN || char === HIGHLIGHT_END_TOKEN) {
          lookbehindIndex -= 1;
          continue;
        }
        isImageSyntax = char === '!';
        break;
      }
      if (isImageSyntax) {
        result += escapeHighlightHtml(working.slice(startIndex, endIndex));
      } else {
        result += '[';
        const linkText = match[1];
        result += `<span class="external-link-text">${escapeHighlightHtml(linkText)}</span>`;
        result += '](';
        result += escapeHighlightHtml(match[2]);
        result += ')';
      }

      lastIndex = endIndex;
    }

    result += escapeHighlightHtml(working.slice(lastIndex));
    const highlightedMarkup = result
      .split(HIGHLIGHT_START_TOKEN)
      .join('<span class="editor-heading-flash">')
      .split(HIGHLIGHT_END_TOKEN)
      .join('</span>');
    return highlightedMarkup + HIGHLIGHT_PLACEHOLDER;
  }

  function syncEditorHighlightScroll() {
    if (!editor || !editorHighlightContent) {
      return;
    }
    const scrollTop = editor.scrollTop || 0;
    const scrollLeft = editor.scrollLeft || 0;
    editorHighlightContent.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
  }

  function updateEditorHighlight(value) {
    if (!ensureEditorHighlightStructure()) {
      if (editorContentContainer) {
        editorContentContainer.classList.remove('editor-highlight-enabled');
      }
      return;
    }
    syncEditorHighlightPadding();
    const markup = buildEditorHighlightMarkup(value, editorHeadingHighlightRange);
    if (markup !== lastHighlightMarkup) {
      editorHighlightContent.innerHTML = markup;
      lastHighlightMarkup = markup;
    }
    if (isEditorHeadingFading) {
      const highlightElements = getEditorHeadingFlashElements();
      for (const element of highlightElements) {
        element.classList.add('editor-heading-fade-out');
      }
    }
    if (editorContentContainer) {
      editorContentContainer.classList.add('editor-highlight-enabled');
    }
    syncEditorHighlightScroll();
  }

  ensureEditorHighlightStructure();
  updateEditorHighlight(editor ? editor.value : '');

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

  const LAYOUT_STORAGE_KEY = 'md:layout:editorWidthRatio';
  const MIN_EDITOR_WIDTH = 100;
  let storedEditorWidthRatio = null;
  let lineNumbersEnabled = false;

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

        editor.value = result;
        editor.selectionStart = editor.selectionEnd = 0;

        updateEditorHighlight(result);
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
          syncEditorHighlightScroll();
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
        editor.value = text;
        editor.selectionStart = editor.selectionEnd = 0;

        updateEditorHighlight(text);
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
          syncEditorHighlightScroll();
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

  const readStoredEditorRatio = () => {
    try {
      const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (raw === null) {
        return null;
      }
      const parsed = parseFloat(raw);
      return Number.isFinite(parsed) ? parsed : null;
    } catch (error) {
      return null;
    }
  };

  const writeStoredEditorRatio = ratio => {
    if (!Number.isFinite(ratio)) {
      return;
    }
    try {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, ratio.toFixed(6));
    } catch (error) {
      // Ignore persistence errors, such as disabled storage.
    }
  };

  const getEditorHorizontalPadding = () => {
    if (!editor) {
      return 0;
    }
    const styles = window.getComputedStyle(editor);
    const paddingLeft = parseFloat(styles.paddingLeft) || 0;
    const paddingRight = parseFloat(styles.paddingRight) || 0;
    return paddingLeft + paddingRight;
  };

  const getLineNumberGutterWidth = () => {
    if (!lineNumberGutter) {
      return 0;
    }
    const styles = window.getComputedStyle(lineNumberGutter);
    if (styles.display === 'none') {
      return 0;
    }
    const rect = lineNumberGutter.getBoundingClientRect();
    return Number.isFinite(rect.width) ? rect.width : 0;
  };

  const getAvailableEditorWidth = () => {
    const rect = mainContainer.getBoundingClientRect();
    const tocWidth = toc ? toc.offsetWidth : 0;
    const tocDividerWidth = tocDivider ? tocDivider.offsetWidth : 0;
    const dividerWidth = divider ? divider.offsetWidth : 0;
    const available = rect.width - tocWidth - tocDividerWidth - dividerWidth;
    return Number.isFinite(available) ? available : 0;
  };

  const setEditorOuterWidth = width => {
    if (!Number.isFinite(width)) {
      return;
    }
    const padding = getEditorHorizontalPadding();
    const gutterWidth = getLineNumberGutterWidth();
    const minContentWidth = Math.max(0, MIN_EDITOR_WIDTH);
    const minOuterWidth = MIN_EDITOR_WIDTH + padding + gutterWidth;
    const normalizedWidth = Math.max(minOuterWidth, Math.round(width));
    const borderBoxWidth = Math.max(
      normalizedWidth - gutterWidth,
      minContentWidth + padding
    );
    if (editorPane) {
      editorPane.style.width = `${normalizedWidth}px`;
    }
    if (editor) {
      editor.style.width = `${borderBoxWidth}px`;
    }
    syncEditorHighlightScroll();
  };

  const clampEditorWidth = (width, totalAvailable) => {
    const padding = getEditorHorizontalPadding();
    const gutterWidth = getLineNumberGutterWidth();
    const minOuterWidth = MIN_EDITOR_WIDTH + padding + gutterWidth;
    const maxWidth = Math.max(minOuterWidth, totalAvailable - minOuterWidth);
    if (!Number.isFinite(width)) {
      return minOuterWidth;
    }
    if (width < minOuterWidth) {
      return minOuterWidth;
    }
    if (width > maxWidth) {
      return maxWidth;
    }
    return width;
  };

  const measureEditorRatio = () => {
    const totalAvailable = getAvailableEditorWidth();
    if (!Number.isFinite(totalAvailable) || totalAvailable <= 0) {
      return null;
    }
    const reference = editorPane || editor;
    const width = clampEditorWidth(
      reference ? reference.getBoundingClientRect().width : 0,
      totalAvailable
    );
    const ratio = width / totalAvailable;
    return Number.isFinite(ratio) ? ratio : null;
  };

  const applyEditorRatio = ratio => {
    if (!Number.isFinite(ratio)) {
      return false;
    }
    const totalAvailable = getAvailableEditorWidth();
    if (!Number.isFinite(totalAvailable) || totalAvailable <= 0) {
      return false;
    }
    const padding = getEditorHorizontalPadding();
    const gutterWidth = getLineNumberGutterWidth();
    const minOuterWidth = MIN_EDITOR_WIDTH + padding + gutterWidth;
    const maxOuterWidth = Math.max(minOuterWidth, totalAvailable - minOuterWidth);
    const minRatio = Math.min(minOuterWidth / totalAvailable, 1);
    const maxRatio = Math.max(minRatio, Math.min(maxOuterWidth / totalAvailable, 1));
    const safeRatio = Math.min(Math.max(ratio, minRatio), maxRatio);
    const desiredWidth = clampEditorWidth(
      Math.round(safeRatio * totalAvailable),
      totalAvailable
    );
    setEditorOuterWidth(desiredWidth);
    return true;
  };

  const syncLineNumberScroll = () => {
    if (lineNumbersEnabled && lineNumberGutter && editor) {
      lineNumberGutter.scrollTop = editor.scrollTop;
    }
    syncEditorHighlightScroll();
  };

  const updateLineNumberButtonLabel = () => {
    if (!toggleLineNumbersBtn) {
      return;
    }
    const key = lineNumbersEnabled
      ? 'toolbar.hideLineNumbers'
      : 'toolbar.showLineNumbers';
    toggleLineNumbersBtn.textContent = i18n.t(key);
    toggleLineNumbersBtn.setAttribute(
      'aria-pressed',
      lineNumbersEnabled ? 'true' : 'false'
    );
  };

  const updateLineNumbers = () => {
    if (!lineNumbersEnabled || !lineNumberGutter || !editor) {
      return;
    }
    const rawValue = editor.value || '';
    const lineCount = Math.max(1, rawValue.split('\n').length);
    const currentCount = Number(lineNumberGutter.dataset.count || 0);
    if (currentCount !== lineCount) {
      const numbers = [];
      for (let i = 1; i <= lineCount; i += 1) {
        numbers.push(`<span class="line-number">${i}</span>`);
      }
      lineNumberGutter.innerHTML = numbers.join('');
      lineNumberGutter.dataset.count = String(lineCount);
    }
    syncLineNumberScroll();
  };

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

    editor.value = nextValue;
    editor.scrollTop = previousScrollTop;
    editor.selectionStart = nextCaret;
    editor.selectionEnd = nextCaret;

    updateEditorHighlight(nextValue);
    AppState.setText(nextValue, 'editor');
    updateLineNumbers();

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

    if (selectionStart === selectionEnd) {
      const insertion = '``';
      nextValue =
        previousValue.slice(0, selectionStart) +
        insertion +
        previousValue.slice(selectionEnd);
      nextSelectionStart = selectionStart + 1;
      nextSelectionEnd = nextSelectionStart;
    } else if (
      selectedText.startsWith('`') &&
      selectedText.endsWith('`') &&
      selectedText.length >= 2
    ) {
      const innerText = selectedText.slice(1, -1);
      nextValue =
        previousValue.slice(0, selectionStart) +
        innerText +
        previousValue.slice(selectionEnd);
      nextSelectionEnd = nextSelectionStart + innerText.length;
    } else {
      const normalized = selectedText.replace(/\r?\n/g, ' ');
      const wrapped = `\`${normalized}\``;
      nextValue =
        previousValue.slice(0, selectionStart) +
        wrapped +
        previousValue.slice(selectionEnd);
      nextSelectionStart = selectionStart;
      nextSelectionEnd = selectionStart + wrapped.length;
    }

    editor.value = nextValue;
    editor.scrollTop = prevScrollTop;
    editor.selectionStart = nextSelectionStart;
    editor.selectionEnd = nextSelectionEnd;

    updateEditorHighlight(nextValue);
    AppState.setText(nextValue, 'editor');
    updateLineNumbers();

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

    if (selectionStart === selectionEnd) {
      const insertion = '[]()';
      nextValue =
        previousValue.slice(0, selectionStart) +
        insertion +
        previousValue.slice(selectionEnd);
      nextSelectionStart = selectionStart + 1;
      nextSelectionEnd = nextSelectionStart;
    } else {
      const wrapped = `[${selectedText}]()`;
      nextValue =
        previousValue.slice(0, selectionStart) +
        wrapped +
        previousValue.slice(selectionEnd);
      nextSelectionStart = selectionStart + selectedText.length + 3;
      nextSelectionEnd = nextSelectionStart;
    }

    editor.value = nextValue;
    editor.scrollTop = prevScrollTop;
    editor.selectionStart = nextSelectionStart;
    editor.selectionEnd = nextSelectionEnd;

    updateEditorHighlight(nextValue);
    AppState.setText(nextValue, 'editor');
    updateLineNumbers();

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

    if (selectionStart === selectionEnd) {
      const insertion = '****';
      nextValue =
        previousValue.slice(0, selectionStart) +
        insertion +
        previousValue.slice(selectionEnd);
      nextSelectionStart = selectionStart + 2;
      nextSelectionEnd = nextSelectionStart;
    } else if (
      selectedText.startsWith('**') &&
      selectedText.endsWith('**') &&
      selectedText.length >= 4
    ) {
      const innerText = selectedText.slice(2, -2);
      nextValue =
        previousValue.slice(0, selectionStart) +
        innerText +
        previousValue.slice(selectionEnd);
      nextSelectionEnd = nextSelectionStart + innerText.length;
    } else {
      const wrapped = `**${selectedText}**`;
      nextValue =
        previousValue.slice(0, selectionStart) +
        wrapped +
        previousValue.slice(selectionEnd);
      nextSelectionEnd = nextSelectionStart + wrapped.length;
    }

    editor.value = nextValue;
    editor.scrollTop = prevScrollTop;
    editor.selectionStart = nextSelectionStart;
    editor.selectionEnd = nextSelectionEnd;

    updateEditorHighlight(nextValue);
    AppState.setText(nextValue, 'editor');
    updateLineNumbers();

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

      editor.value = nextValue;
      editor.selectionStart = nextCaret;
      editor.selectionEnd = nextCaret;

      updateEditorHighlight(nextValue);
      AppState.setText(nextValue, 'editor');
      updateLineNumbers();

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

  const applyLineNumbersEnabled = next => {
    const normalized = Boolean(next);
    const stateChanged = lineNumbersEnabled !== normalized;
    lineNumbersEnabled = normalized;
    if (lineNumberGutter) {
      lineNumberGutter.classList.toggle('line-numbers-visible', lineNumbersEnabled);
      lineNumberGutter.setAttribute(
        'aria-hidden',
        lineNumbersEnabled ? 'false' : 'true'
      );
      if (!lineNumbersEnabled) {
        lineNumberGutter.innerHTML = '';
        lineNumberGutter.scrollTop = 0;
        delete lineNumberGutter.dataset.count;
      }
    }
    updateLineNumberButtonLabel();
    if (lineNumbersEnabled) {
      updateLineNumbers();
    }
    if (stateChanged && editorPane) {
      const currentWidth = editorPane.getBoundingClientRect().width;
      setEditorOuterWidth(currentWidth);
    }
  };

  const setLineNumbersEnabled = next => {
    const normalized = Boolean(next);
    if (normalized === lineNumbersEnabled) {
      return;
    }
    applyLineNumbersEnabled(normalized);
    AppState.setSetting('showLineNumbers', normalized);
  };

  const persistEditorWidthRatio = () => {
    const ratio = measureEditorRatio();
    if (ratio === null) {
      return;
    }
    storedEditorWidthRatio = ratio;
    writeStoredEditorRatio(ratio);
  };

  const restoreEditorWidthRatio = () => {
    const stored = readStoredEditorRatio();
    if (stored !== null && applyEditorRatio(stored)) {
      storedEditorWidthRatio = stored;
    } else {
      storedEditorWidthRatio = measureEditorRatio();
    }
  };

  restoreEditorWidthRatio();

  initializeFormattingMenu();

  // Enable drag to resize panes
  let isDraggingEditor = false;
  let isDraggingTOC = false;

  divider.addEventListener('mousedown', e => {
    isDraggingEditor = true;
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });

  tocDivider.addEventListener('mousedown', e => {
    isDraggingTOC = true;
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    const rect = mainContainer.getBoundingClientRect();
    if (isDraggingEditor) {
      const tocWidth =
        (toc ? toc.offsetWidth : 0) + (tocDivider ? tocDivider.offsetWidth : 0);
      const dividerWidth = divider.offsetWidth;
      const totalAvailable = rect.width - tocWidth - dividerWidth;
      if (!Number.isFinite(totalAvailable) || totalAvailable <= 0) {
        return;
      }
      const proposedWidth =
        e.clientX - rect.left - tocWidth - dividerWidth / 2;
      const clampedWidth = clampEditorWidth(proposedWidth, totalAvailable);
      setEditorOuterWidth(clampedWidth);
    } else if (isDraggingTOC) {
      const dividerWidth = tocDivider.offsetWidth;
      let newTocWidth = e.clientX - rect.left;
      const editorOuterWidth = editorPane ? editorPane.offsetWidth : editor.offsetWidth;
      const padding = getEditorHorizontalPadding();
      const gutterWidth = getLineNumberGutterWidth();
      const minPreviewOuter = MIN_EDITOR_WIDTH + padding + gutterWidth;
      const minTocWidth = MIN_EDITOR_WIDTH;
      const maxWidth =
        rect.width -
        dividerWidth -
        divider.offsetWidth -
        editorOuterWidth -
        minPreviewOuter;
      if (newTocWidth < minTocWidth) newTocWidth = minTocWidth;
      if (newTocWidth > maxWidth) newTocWidth = maxWidth;
      toc.style.width = `${newTocWidth}px`;
    }
  });

  document.addEventListener('mouseup', () => {
    const wasDraggingEditor = isDraggingEditor;
    if (isDraggingEditor || isDraggingTOC) {
      isDraggingEditor = false;
      isDraggingTOC = false;
      document.body.style.cursor = '';
    }
    if (wasDraggingEditor) {
      persistEditorWidthRatio();
    }
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
    if (storedEditorWidthRatio !== null && !isDraggingEditor) {
      applyEditorRatio(storedEditorWidthRatio);
    }
    syncEditorHighlightPadding();
    syncEditorHighlightScroll();
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
    updateEditorHighlight(text);
    updateLineNumbers();
    syncLineNumberScroll();
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
    flashEditorHeading(headingInfo);
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
    syncLineNumberScroll();
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

  function getHeadingSelectionRange(headingInfo) {
    if (!headingInfo) {
      return { start: 0, end: 0 };
    }
    const start = Number.isFinite(headingInfo.start) ? headingInfo.start : 0;
    let end = Number.isFinite(headingInfo.end) ? headingInfo.end : start;
    if (!Number.isFinite(end) || end < start) {
      const value = editor && typeof editor.value === 'string' ? editor.value : '';
      if (value) {
        const newlineIndex = value.indexOf('\n', start);
        end = newlineIndex === -1 ? value.length : newlineIndex;
      } else {
        end = start;
      }
    }
    if (end < start) {
      end = start;
    }
    return { start, end };
  }

  function flashEditorHeading(headingInfo) {
    if (!editor || !headingInfo) {
      return;
    }
    const range = getHeadingSelectionRange(headingInfo);
    if (!range || range.end <= range.start) {
      return;
    }
    editorHeadingHighlightRange = range;
    clearEditorHeadingTimers();
    clearEditorHeadingFadeState();
    lastHighlightMarkup = null;
    updateEditorHighlight(editor.value);
    editorHeadingFlashTimeout = window.setTimeout(() => {
      editorHeadingFlashTimeout = null;
      if (prefersReducedMotion()) {
        stopEditorHeadingHighlight();
        return;
      }
      const highlightElements = getEditorHeadingFlashElements();
      if (!highlightElements.length) {
        stopEditorHeadingHighlight();
        return;
      }
      for (const element of highlightElements) {
        element.classList.add('editor-heading-fade-out');
      }
      isEditorHeadingFading = true;
      editorHeadingFadeTimeout = window.setTimeout(() => {
        editorHeadingFadeTimeout = null;
        stopEditorHeadingHighlight();
      }, HEADING_FLASH_FADE_DURATION);
    }, HEADING_FLASH_DURATION);
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
      syncLineNumberScroll();
    }
    updateTOCHighlight();
    alignEditorScrollToHeading(headingInfo.start, previewDetail);
  }

  editor.addEventListener('input', () => {
    hideFormattingMenu();
    stopEditorHeadingHighlight();
    AppState.setText(editor.value, 'editor');
    updateLineNumbers();
  });
  editor.addEventListener('scroll', () => {
    hideFormattingMenu();
    syncLineNumberScroll();
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

    let remainder = value.slice(selectionEnd);
    if (remainder.startsWith(' ')) {
      remainder = remainder.slice(1);
    }

    const checkboxSegment = hasCheckbox ? '[ ] ' : '';
    const insertion = `\n${indent}${nextMarker} ${checkboxSegment}`;
    const newValue =
      value.slice(0, selectionStart) + insertion + remainder;

    const newCursorPos = selectionStart + insertion.length;
    const prevScrollTop = editor.scrollTop;

    editor.value = newValue;
    editor.scrollTop = prevScrollTop;
    editor.selectionStart = editor.selectionEnd = newCursorPos;

    updateEditorHighlight(editor.value);
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
      editor.value = newValue;

      updateEditorHighlight(newValue);
      AppState.setText(newValue, 'editor');
    };
    reader.readAsDataURL(file);
  });

  if (exportPdfBtn) {
    exportPdfBtn.addEventListener('click', () => {
      const win = window.open('', '', 'width=800,height=600');
      if (!win) {
        return;
      }
      const cssLink = document.querySelector('link[rel="stylesheet"]');
      const cssHref = cssLink ? cssLink.href : '';
      const previewTitle = i18n.t('dialogs.previewTitle');
      const langAttr =
        document.documentElement.getAttribute('lang') || i18n.getCurrentLang();
      const linkTag = cssHref
        ? `<link rel="stylesheet" href="${cssHref}">`
        : '';
      win.document.write(
        `<!DOCTYPE html><html lang="${langAttr}"><head><meta charset="UTF-8"><title>${previewTitle}</title>${linkTag}</head><body>${preview.innerHTML}</body></html>`
      );
      win.document.close();
      win.onload = () => {
        win.focus();
        win.print();
        win.close();
      };
    });
  }

const EXPORT_STYLESHEET_FALLBACK = String.raw`
body {
  margin: 0;
  font-family: 'Helvetica Neue', sans-serif;
  background-color: #f6faff;
  color: #002244;
}

#preview {
  padding: 1rem;
  box-sizing: border-box;
  background-color: #ffffff;
  color: #002244;
}

#preview img,
#preview .mermaid svg {
  max-width: 100%;
  height: auto;
}

.mermaid .label foreignObject > div {
  white-space: pre-wrap;
  word-break: break-all;
  overflow-wrap: anywhere;
}

#preview h1,
#preview h2,
#preview h3,
#preview h4,
#preview h5 {
  border-bottom: 1px solid #aac8ff;
  color: #0055aa;
}

pre {
  background: #dfefff;
  padding: 0.5rem;
  overflow-x: auto;
  border-left: 4px solid #88b4ff;
}

code {
  background: #cce0ff;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  color: #003366;
}

pre code {
  display: block;
  padding: 0;
  background: transparent;
  color: inherit;
}

a {
  color: #0077cc;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

@media print {
  pre {
    white-space: pre-wrap;
    overflow-x: visible;
  }
}
`;

  async function getInlineStylesheetContent() {
    const link = document.querySelector('link[rel="stylesheet"]');
    if (!link) {
      return EXPORT_STYLESHEET_FALLBACK;
    }

    const { sheet } = link;
    if (sheet) {
      try {
        const rules = sheet.cssRules || sheet.rules;
        if (rules && rules.length) {
          return Array.from(rules)
            .map(rule => rule.cssText)
            .join('\n');
        }
      } catch (error) {
        console.warn('[Export] Unable to read stylesheet rules directly.', error);
      }
    }

    const href = typeof link.href === 'string' ? link.href : '';
    if (!href) {
      return EXPORT_STYLESHEET_FALLBACK;
    }

    const fetchStylesheet = async () => {
      if (typeof fetch !== 'function') {
        return EXPORT_STYLESHEET_FALLBACK;
      }

      const response = await fetch(href, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Stylesheet request failed with status ${response.status}`);
      }

      return await response.text();
    };

    try {
      const text = await fetchStylesheet();
      if (text) {
        return text;
      }
    } catch (error) {
      console.warn('[Export] Failed to fetch stylesheet for HTML export.', error);

      if (href.startsWith('file:') && typeof XMLHttpRequest !== 'undefined') {
        try {
          const text = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', href, true);
            xhr.responseType = 'text';
            xhr.onload = () => {
              if (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) {
                resolve(xhr.responseText);
              } else {
                reject(
                  new Error(
                    `XHR request failed with status ${xhr.status || '0'} for ${href}`
                  )
                );
              }
            };
            xhr.onerror = () => {
              reject(new Error(`XHR request encountered a network error for ${href}`));
            };
            xhr.send();
          });

          if (typeof text === 'string') {
            return text;
          }
        } catch (xhrError) {
          console.warn('[Export] XHR fallback failed to read stylesheet.', xhrError);
        }
      }

      console.info('[Export] Falling back to bundled preview styles for HTML export.');
      return EXPORT_STYLESHEET_FALLBACK;
    }

    if (href.startsWith('file:')) {
      console.info('[Export] Using bundled preview styles for file protocol HTML export.');
      return EXPORT_STYLESHEET_FALLBACK;
    }

    return '';
  }

  if (exportHtmlBtn) {
    exportHtmlBtn.addEventListener('click', async () => {
      try {
        if (!preview) {
          throw new Error('Preview element is not available.');
        }

        const previewTitle = i18n.t('dialogs.previewTitle');
        const langAttr =
          document.documentElement.getAttribute('lang') || i18n.getCurrentLang();
        const cssLink = document.querySelector('link[rel="stylesheet"]');
        const cssHref = cssLink ? cssLink.href : '';
        const inlineStyles = await getInlineStylesheetContent();
        let headStyles = '';
        if (inlineStyles) {
          const sanitized = inlineStyles.replace(/<\/style/gi, '<\\/style');
          headStyles = `<style>${sanitized}</style>`;
        } else if (cssHref) {
          headStyles = `<link rel="stylesheet" href="${cssHref}">`;
        }
        const bodyContent = `<div id="preview" class="export-preview">${preview.innerHTML}</div>`;
        const html =
          `<!DOCTYPE html><html lang="${langAttr}"><head><meta charset="UTF-8"><title>${previewTitle}</title>${headStyles}</head><body>${bodyContent}</body></html>`;

        const defaultName = i18n.t('dialogs.defaultHtmlFileName');
        const trimmedName =
          typeof defaultName === 'string' && defaultName.trim()
            ? defaultName.trim()
            : 'preview.html';
        const filename = trimmedName.endsWith('.html')
          ? trimmedName
          : `${trimmedName}.html`;

        triggerDownloadFromBlob(
          new Blob([html], { type: 'text/html;charset=utf-8' }),
          filename
        );
      } catch (error) {
        console.error('[Export] Failed to download preview HTML.', error);
      }
    });
  }

  saveMdBtn.addEventListener('click', () => {
    const defaultName = i18n.t('dialogs.defaultFileName');
    const trimmedName =
      typeof defaultName === 'string' && defaultName.trim()
        ? defaultName.trim()
        : 'document.md';
    const filename = trimmedName.endsWith('.md') ? trimmedName : `${trimmedName}.md`;

    try {
      triggerDownloadFromBlob(
        new Blob([AppState.getText()], { type: 'text/markdown;charset=utf-8' }),
        filename
      );
    } catch (error) {
      console.error('[Export] Failed to download Markdown file.', error);
    }
  });

  helpBtn.addEventListener('click', () => {
    helpWindow.classList.toggle('hidden');
  });

  helpClose.addEventListener('click', () => {
    helpWindow.classList.add('hidden');
  });

  if (toggleLineNumbersBtn) {
    toggleLineNumbersBtn.addEventListener('click', () => {
      setLineNumbersEnabled(!lineNumbersEnabled);
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
        flashEditorHeading(headingInfo);
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
      applyLineNumbersEnabled(Boolean(event.value));
    }
  });

  AppState.init({
    text: editor.value,
    settings: { lang: i18n.getCurrentLang() }
  });

  const initialSettings = AppState.getSettings();
  applyLineNumbersEnabled(Boolean(initialSettings.showLineNumbers));

}

