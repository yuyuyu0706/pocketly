(function (global) {
  'use strict';

  // === Private state: highlight ===
  let _editor = null;
  let _editorPane = null;
  let _lineNumberGutter = null;
  let _mainContainer = null;
  let _toc = null;
  let _tocDivider = null;
  let _divider = null;
  let _toggleLineNumbersBtn = null;
  let _i18n = null;
  let _AppState = null;

  let editorContentContainer = null;
  let editorHighlightElement = null;
  let editorHighlightContent = null;
  let lastHighlightMarkup = null;
  let editorHeadingFlashTimeout = null;
  let editorHeadingFadeTimeout = null;
  let isEditorHeadingFading = false;
  let editorHeadingHighlightRange = null;

  const HIGHLIGHT_PLACEHOLDER = '&#8203;';
  const HIGHLIGHT_START_TOKEN = '';
  const HIGHLIGHT_END_TOKEN = '';
  const HEADING_FLASH_DURATION = 2000;
  const HEADING_FLASH_FADE_DURATION = 600;

  // === Private state: layout ===
  const LAYOUT_STORAGE_KEY = 'md:layout:editorWidthRatio';
  const MIN_EDITOR_WIDTH = 100;
  const LINE_NUMBER_DEBOUNCE_MS = 50;
  let storedEditorWidthRatio = null;
  let lineNumbersEnabled = false;
  let isDraggingEditor = false;
  let isDraggingTOC = false;
  let _isFloating = false;
  let _isPiP = false;
  let _lastMouseX = 0;

  // === Private state: line number mirror ===
  let _mirrorElement = null;
  let _lineNumberUpdateTimer = null;
  let _mirrorLastWidth = -1;
  let _mirrorLastValue = null;
  let _lineHeightPx = 0;
  let _editorResizeObserver = null;
  let _paneResizeObserver = null;

  // === Highlight functions ===

  function ensureEditorHighlightStructure() {
    if (!_editor) {
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

    if (_editorPane && editorContentContainer.parentElement !== _editorPane) {
      _editorPane.appendChild(editorContentContainer);
    }

    if (editorContentContainer && !editorContentContainer.contains(_editor)) {
      editorContentContainer.appendChild(_editor);
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
    updateEditorHighlight(_editor ? _editor.value : '');
  }

  function syncEditorHighlightPadding() {
    if (!_editor || !editorContentContainer) {
      return;
    }
    const styles = window.getComputedStyle(_editor);
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
    const scrollbarWidth = Math.max(0, _editor.offsetWidth - _editor.clientWidth);
    editorContentContainer.style.setProperty(
      '--editor-scrollbar-width',
      `${scrollbarWidth}px`
    );
    const scrollbarHeight = Math.max(0, _editor.offsetHeight - _editor.clientHeight);
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
    if (!_editor || !editorHighlightContent) {
      return;
    }
    const scrollTop = _editor.scrollTop || 0;
    const scrollLeft = _editor.scrollLeft || 0;
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

  // === Heading flash ===

  function getHeadingSelectionRange(headingInfo) {
    if (!headingInfo) {
      return { start: 0, end: 0 };
    }
    const start = Number.isFinite(headingInfo.start) ? headingInfo.start : 0;
    let end = Number.isFinite(headingInfo.end) ? headingInfo.end : start;
    if (!Number.isFinite(end) || end < start) {
      const value = _editor && typeof _editor.value === 'string' ? _editor.value : '';
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
    if (!_editor || !headingInfo) {
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
    updateEditorHighlight(_editor.value);
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

  // === Layout / sizing functions ===

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
    if (!_editor) {
      return 0;
    }
    const styles = window.getComputedStyle(_editor);
    const paddingLeft = parseFloat(styles.paddingLeft) || 0;
    const paddingRight = parseFloat(styles.paddingRight) || 0;
    return paddingLeft + paddingRight;
  };

  const getLineNumberGutterWidth = () => {
    if (!_lineNumberGutter) {
      return 0;
    }
    const styles = window.getComputedStyle(_lineNumberGutter);
    if (styles.display === 'none') {
      return 0;
    }
    const rect = _lineNumberGutter.getBoundingClientRect();
    return Number.isFinite(rect.width) ? rect.width : 0;
  };

  const getAvailableEditorWidth = () => {
    const rect = _mainContainer.getBoundingClientRect();
    const tocWidth = _toc ? _toc.offsetWidth : 0;
    const tocDividerWidth = _tocDivider ? _tocDivider.offsetWidth : 0;
    const dividerWidth = _divider ? _divider.offsetWidth : 0;
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
    if (_editorPane) {
      _editorPane.style.width = `${normalizedWidth}px`;
    }
    if (_editor) {
      _editor.style.width = `${borderBoxWidth}px`;
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
    const reference = _editorPane || _editor;
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
    if (lineNumbersEnabled && _lineNumberGutter && _editor) {
      _lineNumberGutter.scrollTop = _editor.scrollTop;
    }
    syncEditorHighlightScroll();
  };

  // === Mirror element for measuring wrapped line heights ===

  const ensureMirrorElement = () => {
    if (_mirrorElement && _mirrorElement.isConnected) {
      return _mirrorElement;
    }
    const mirror = document.createElement('div');
    mirror.setAttribute('aria-hidden', 'true');
    mirror.style.cssText = [
      'position:absolute',
      'top:0',
      'left:0',
      'visibility:hidden',
      'pointer-events:none',
      'overflow:hidden',
      'white-space:pre-wrap',
      'word-wrap:break-word',
      'overflow-wrap:break-word',
      'box-sizing:border-box',
    ].join(';');
    document.body.appendChild(mirror);
    _mirrorElement = mirror;
    return mirror;
  };

  const getLineHeightPx = () => {
    if (!_editor) {
      return 24;
    }
    const styles = window.getComputedStyle(_editor);
    const lh = parseFloat(styles.lineHeight);
    return Number.isFinite(lh) && lh > 0 ? lh : parseFloat(styles.fontSize) * 1.5;
  };

  const syncMirrorStyles = mirror => {
    if (!_editor) {
      return;
    }
    const styles = window.getComputedStyle(_editor);
    mirror.style.fontFamily = styles.fontFamily;
    mirror.style.fontSize = styles.fontSize;
    mirror.style.lineHeight = styles.lineHeight;
    mirror.style.fontWeight = styles.fontWeight;
    mirror.style.letterSpacing = styles.letterSpacing;
    mirror.style.paddingLeft = styles.paddingLeft;
    mirror.style.paddingRight = styles.paddingRight;
    mirror.style.width = `${_editor.clientWidth}px`;
  };

  const measureLineRows = logicalLines => {
    const mirror = ensureMirrorElement();
    if (!mirror || !_editor) {
      return logicalLines.map(() => 1);
    }
    syncMirrorStyles(mirror);
    _lineHeightPx = getLineHeightPx();
    const lh = _lineHeightPx;

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < logicalLines.length; i++) {
      const div = document.createElement('div');
      const text = logicalLines[i];
      div.textContent = text.length > 0 ? text : '​';
      fragment.appendChild(div);
    }
    mirror.innerHTML = '';
    mirror.appendChild(fragment);

    const children = mirror.children;
    const result = new Array(logicalLines.length);
    for (let i = 0; i < children.length; i++) {
      const h = children[i].offsetHeight;
      result[i] = Math.max(1, Math.round(h / lh));
    }
    mirror.innerHTML = '';
    return result;
  };

  const updateLineNumberButtonLabel = () => {
    if (!_toggleLineNumbersBtn) {
      return;
    }
    const key = lineNumbersEnabled
      ? 'toolbar.hideLineNumbers'
      : 'toolbar.showLineNumbers';
    _toggleLineNumbersBtn.textContent = _i18n.t(key);
    _toggleLineNumbersBtn.setAttribute(
      'aria-pressed',
      lineNumbersEnabled ? 'true' : 'false'
    );
  };

  const updateLineNumbers = () => {
    if (!lineNumbersEnabled || !_lineNumberGutter || !_editor) {
      return;
    }
    const rawValue = _editor.value || '';
    const currentWidth = _editor.clientWidth;
    if (_mirrorLastValue === rawValue && _mirrorLastWidth === currentWidth) {
      syncLineNumberScroll();
      return;
    }
    _mirrorLastValue = rawValue;
    _mirrorLastWidth = currentWidth;

    const logicalLines = rawValue.split('\n');
    const lineCount = Math.max(1, logicalLines.length);
    const rowsPerLine = measureLineRows(logicalLines);

    const digits = String(lineCount).length;
    const currentDigits = Number(_lineNumberGutter.dataset.digits || 0);

    const parts = [];
    for (let i = 0; i < lineCount; i++) {
      const rows = rowsPerLine[i] || 1;
      parts.push(`<span class="line-number">${i + 1}</span>`);
      for (let r = 1; r < rows; r++) {
        parts.push('<span class="line-number line-number-continuation">&nbsp;</span>');
      }
    }
    _lineNumberGutter.innerHTML = parts.join('');
    _lineNumberGutter.dataset.count = String(lineCount);

    if (digits !== currentDigits) {
      _lineNumberGutter.style.minWidth = `calc(${digits}ch + 0.875rem)`;
      _lineNumberGutter.dataset.digits = String(digits);
      const paneWidth = _editorPane ? _editorPane.offsetWidth : (_editor ? _editor.offsetWidth : 0);
      setEditorOuterWidth(paneWidth);
    }
    syncLineNumberScroll();
  };

  const scheduleUpdateLineNumbers = () => {
    if (_lineNumberUpdateTimer !== null) {
      window.clearTimeout(_lineNumberUpdateTimer);
    }
    _lineNumberUpdateTimer = window.setTimeout(() => {
      _lineNumberUpdateTimer = null;
      updateLineNumbers();
    }, LINE_NUMBER_DEBOUNCE_MS);
  };

  const applyLineNumbersEnabled = next => {
    const normalized = Boolean(next);
    const stateChanged = lineNumbersEnabled !== normalized;
    lineNumbersEnabled = normalized;
    if (_lineNumberGutter) {
      _lineNumberGutter.classList.toggle('line-numbers-visible', lineNumbersEnabled);
      _lineNumberGutter.setAttribute(
        'aria-hidden',
        lineNumbersEnabled ? 'false' : 'true'
      );
      if (!lineNumbersEnabled) {
        _lineNumberGutter.innerHTML = '';
        _lineNumberGutter.scrollTop = 0;
        delete _lineNumberGutter.dataset.count;
      }
    }
    updateLineNumberButtonLabel();
    if (lineNumbersEnabled) {
      updateLineNumbers();
    }
    if (stateChanged && _editorPane) {
      const currentWidth = _editorPane.getBoundingClientRect().width;
      setEditorOuterWidth(currentWidth);
    }
  };

  const setLineNumbersEnabled = next => {
    const normalized = Boolean(next);
    if (normalized === lineNumbersEnabled) {
      return;
    }
    applyLineNumbersEnabled(normalized);
    _AppState.setSetting('showLineNumbers', normalized);
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

  const onResize = () => {
    if (!_isFloating && !_isPiP && storedEditorWidthRatio !== null && !isDraggingEditor) {
      applyEditorRatio(storedEditorWidthRatio);
    }
    syncEditorHighlightPadding();
    syncEditorHighlightScroll();
  };

  function initDragHandlers() {
    _divider.addEventListener('mousedown', e => {
      isDraggingEditor = true;
      _lastMouseX = e.clientX;
      document.body.style.cursor = 'col-resize';
      e.preventDefault();
    });

    _tocDivider.addEventListener('mousedown', e => {
      isDraggingTOC = true;
      document.body.style.cursor = 'col-resize';
      e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
      const rect = _mainContainer.getBoundingClientRect();
      if (isDraggingEditor) {
        const tocWidth =
          (_toc ? _toc.offsetWidth : 0) + (_tocDivider ? _tocDivider.offsetWidth : 0);
        const dividerWidth = _divider.offsetWidth;
        const totalAvailable = rect.width - tocWidth - dividerWidth;
        if (!Number.isFinite(totalAvailable) || totalAvailable <= 0) {
          return;
        }
        if (_isFloating) {
          const dx = e.clientX - _lastMouseX;
          _lastMouseX = e.clientX;
          const currentWidth = _editorPane ? _editorPane.offsetWidth : 0;
          const clampedWidth = clampEditorWidth(currentWidth + dx, totalAvailable);
          setEditorOuterWidth(clampedWidth);
        } else {
          const proposedWidth =
            e.clientX - rect.left - tocWidth - dividerWidth / 2;
          const clampedWidth = clampEditorWidth(proposedWidth, totalAvailable);
          setEditorOuterWidth(clampedWidth);
        }
      } else if (isDraggingTOC) {
        const dividerWidth = _tocDivider.offsetWidth;
        let newTocWidth = e.clientX - rect.left;
        const editorOuterWidth = _editorPane ? _editorPane.offsetWidth : _editor.offsetWidth;
        const padding = getEditorHorizontalPadding();
        const gutterWidth = getLineNumberGutterWidth();
        const minPreviewOuter = MIN_EDITOR_WIDTH + padding + gutterWidth;
        const minTocWidth = MIN_EDITOR_WIDTH;
        const maxWidth =
          rect.width -
          dividerWidth -
          _divider.offsetWidth -
          editorOuterWidth -
          minPreviewOuter;
        if (newTocWidth < minTocWidth) newTocWidth = minTocWidth;
        if (newTocWidth > maxWidth) newTocWidth = maxWidth;
        _toc.style.width = `${newTocWidth}px`;
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
  }

  function init(deps) {
    _editor = deps.editor;
    _editorPane = deps.editorPane;
    _lineNumberGutter = deps.lineNumberGutter;
    _mainContainer = deps.mainContainer;
    _toc = deps.toc;
    _tocDivider = deps.tocDivider;
    _divider = deps.divider;
    _toggleLineNumbersBtn = deps.toggleLineNumbersBtn;
    _i18n = deps.i18n;
    _AppState = deps.AppState;

    editorContentContainer = deps.editorContentContainer || null;
    editorHighlightElement = deps.editorHighlightElement || null;
    editorHighlightContent = deps.editorHighlightContent || null;

    ensureEditorHighlightStructure();
    updateEditorHighlight(_editor ? _editor.value : '');

    restoreEditorWidthRatio();
    initDragHandlers();

    if (_editor && typeof ResizeObserver !== 'undefined') {
      if (_editorResizeObserver) {
        _editorResizeObserver.disconnect();
      }
      _editorResizeObserver = new ResizeObserver(() => {
        if (lineNumbersEnabled) {
          _mirrorLastWidth = -1;
          scheduleUpdateLineNumbers();
        }
      });
      _editorResizeObserver.observe(_editor);
    }

    if (_editorPane && typeof ResizeObserver !== 'undefined') {
      if (_paneResizeObserver) {
        _paneResizeObserver.disconnect();
      }
      _paneResizeObserver = new ResizeObserver(() => {
        if (_isFloating) {
          setEditorOuterWidth(_editorPane.offsetWidth);
        }
      });
      _paneResizeObserver.observe(_editorPane);
    }
  }

  function isDocumentPiPSupported() {
    return 'documentPictureInPicture' in window && !navigator.webdriver;
  }

  global.Layout = {
    init,
    isDocumentPiPSupported,
    updateEditorHighlight,
    syncEditorHighlightScroll,
    syncEditorHighlightPadding,
    stopEditorHeadingHighlight,
    flashEditorHeading,
    updateLineNumbers,
    scheduleUpdateLineNumbers,
    syncLineNumberScroll,
    setEditorOuterWidth,
    clampEditorWidth,
    applyEditorRatio,
    measureEditorRatio,
    getLineNumberGutterWidth,
    getEditorHorizontalPadding,
    applyLineNumbersEnabled,
    setLineNumbersEnabled,
    persistEditorWidthRatio,
    restoreEditorWidthRatio,
    onResize,
    isLineNumbersEnabled: () => lineNumbersEnabled,
    setFloating: (value) => { _isFloating = Boolean(value); },
    setPiPMode: (value) => { _isPiP = Boolean(value); },
    isDraggingDivider: () => isDraggingEditor,
  };
})(typeof window !== 'undefined' ? window : this);
