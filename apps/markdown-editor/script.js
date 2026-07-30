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
    Formatting.hideFormattingMenu();
    Layout.stopEditorHeadingHighlight();
    AppState.setText(editor.value, 'editor');
    Layout.updateLineNumbers();
  });
  editor.addEventListener('scroll', () => {
    Formatting.hideFormattingMenu();
    Layout.syncLineNumberScroll();
  });

  editor.addEventListener('keydown', event => {
    Formatting.onEditorKeydown(event);
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
      Formatting.replaceEditorRange(cursorPos, cursorPos, markdownImage);

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

