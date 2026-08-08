(function (global) {
  'use strict';

  let _editor = null;
  let _toc = null;
  let _preview = null;
  let _AppState = null;
  let _Bus = null;
  let _Preview = null;
  let _Layout = null;

  let headings = [];
  let tocItems = [];
  let headingPositions = [];
  let headingInfoById = new Map();
  let cursorHeadingHighlightId = null;
  let pendingHeadingAlignmentId = null;
  let pendingHeadingHighlightId = null;
  let editorMeasurementElement = null;
  let hasUserActivatedHeadingHighlight = false;

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

  const markHeadingHighlightActivation = () => {
    if (hasUserActivatedHeadingHighlight) {
      return;
    }
    hasUserActivatedHeadingHighlight = true;
    const ownerDoc = (_editor && _editor.ownerDocument) || document;
    ownerDoc.removeEventListener('pointerdown', markHeadingHighlightActivation, true);
    ownerDoc.removeEventListener('keydown', markHeadingHighlightActivation, true);
    ownerDoc.removeEventListener('touchstart', markHeadingHighlightActivation, true);
  };

  function ensureEditorMeasurementElement() {
    if (editorMeasurementElement && editorMeasurementElement.isConnected) {
      return editorMeasurementElement;
    }
    const ownerDoc = (_editor && _editor.ownerDocument) || document;
    const measure = ownerDoc.createElement('div');
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
    ownerDoc.body.appendChild(editorMeasurementElement);
    return editorMeasurementElement;
  }

  function applyEditorMeasurementStyles(target) {
    if (!_editor) {
      return null;
    }
    const styles = window.getComputedStyle(_editor);
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
    if (!_editor || typeof position !== 'number' || position < 0) {
      return null;
    }
    const measurement = ensureEditorMeasurementElement();
    const styles = applyEditorMeasurementStyles(measurement);
    if (!styles) {
      return null;
    }
    const value = _editor.value || '';
    const clampedPosition = Math.min(position, value.length);
    const beforeText = value.slice(0, clampedPosition);
    measurement.textContent = beforeText;
    const marker = measurement.ownerDocument.createElement('span');
    marker.textContent = '​';
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
    if (!_editor) {
      return;
    }
    _editor.scrollTop = value;
    _Layout.syncLineNumberScroll();
  }

  function animateEditorScrollTo(target) {
    if (!_editor) {
      return;
    }

    const maxScroll = Math.max(_editor.scrollHeight - _editor.clientHeight, 0);
    const clampedTarget = Math.min(Math.max(target, 0), maxScroll);

    applyEditorScrollTop(clampedTarget);
  }

  function alignEditorScrollToHeading(position, previewDetail) {
    if (!_editor) {
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
    const maxScroll = Math.max(_editor.scrollHeight - _editor.clientHeight, 0);
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
    if (!_Preview || typeof _Preview.computeScrollTarget !== 'function') {
      return null;
    }
    try {
      return _Preview.computeScrollTarget(headingElement);
    } catch (error) {
      console.warn('[TOC] Failed to compute preview scroll target for heading.', error);
      return null;
    }
  }

  function focusEditorOnHeading(headingInfo, previewDetail) {
    if (!_editor || !headingInfo) {
      return;
    }
    const previousScrollTop = _editor.scrollTop;
    let preventScrollWorked = false;
    if (typeof _editor.focus === 'function') {
      try {
        _editor.focus({ preventScroll: true });
        preventScrollWorked = true;
      } catch (error) {
        _editor.focus();
      }
    }
    if (typeof _editor.setSelectionRange === 'function') {
      _editor.setSelectionRange(headingInfo.start, headingInfo.start);
    } else {
      _editor.selectionStart = _editor.selectionEnd = headingInfo.start;
    }
    if (!preventScrollWorked && _editor.scrollTop !== previousScrollTop) {
      _editor.scrollTop = previousScrollTop;
      _Layout.syncLineNumberScroll();
    }
    updateTOCHighlight();
    alignEditorScrollToHeading(headingInfo.start, previewDetail);
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
    if (!_editor) {
      cursorHeadingHighlightId = null;
      return null;
    }

    const start = Number.isFinite(_editor.selectionStart) ? _editor.selectionStart : 0;
    const end = Number.isFinite(_editor.selectionEnd) ? _editor.selectionEnd : start;
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
    _Layout.flashEditorHeading(headingInfo);
    if (
      hasUserActivatedHeadingHighlight &&
      _Preview &&
      typeof _Preview.highlightHeading === 'function'
    ) {
      _Preview.highlightHeading(headingInfo.id);
    }

    return headingInfo;
  }

  function setActiveTocItem(id) {
    tocItems.forEach(item => {
      item.classList.toggle('active', item.dataset.target === id);
      item.classList.remove('active-ancestor');
    });
    const activeItem = Array.from(tocItems).find(item => item.dataset.target === id);
    if (activeItem) {
      const level = activeItem.dataset.level;
      if (level && level !== '1' && level !== '2' && level !== '3') {
        const ancestor = activeItem.closest('.toc-item[data-level="3"]');
        if (ancestor) {
          ancestor.classList.add('active-ancestor');
        }
      }
    }
  }

  function updateTOCHighlight() {
    if (!headingPositions.length) return;
    const start = Number.isFinite(_editor.selectionStart) ? _editor.selectionStart : 0;
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
      item.classList.remove('active-ancestor');
    });
    const activeItem = Array.from(tocItems).find(item => item.dataset.target === currentId);
    if (activeItem) {
      const level = activeItem.dataset.level;
      if (level && level !== '1' && level !== '2' && level !== '3') {
        const ancestor = activeItem.closest('.toc-item[data-level="3"]');
        if (ancestor) {
          ancestor.classList.add('active-ancestor');
        }
      }
    }
    updateCursorHeadingHighlight();
  }

  function buildTOC() {
    const raw = _AppState.getText();
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
      _preview.querySelectorAll('h1, h2, h3, h4, h5')
    );
    headingElements.forEach((h, i) => {
      if (headingPositions[i]) {
        h.id = headingPositions[i].id;
      }
    });

    const tocOwnerDoc = (_toc && _toc.ownerDocument) || document;
    const tocHeadingPositions = headingPositions.filter(hp => hp.level <= 4);
    const root = tocOwnerDoc.createElement('ul');
    const stack = [root];
    let currentLevel = 1;

    tocHeadingPositions.forEach(({ level, text, id }) => {
      if (level > currentLevel) {
        for (let i = currentLevel; i < level; i++) {
          const ul = tocOwnerDoc.createElement('ul');
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

      const li = tocOwnerDoc.createElement('li');
      li.className = 'toc-item';
      li.dataset.target = id;
      li.dataset.level = String(level);
      const label = tocOwnerDoc.createElement('span');
      label.className = 'toc-label';
      label.textContent = text;
      li.appendChild(label);
      stack[stack.length - 1].appendChild(li);

      currentLevel = level;
    });

    _toc.innerHTML = '';
    _toc.appendChild(root);

    tocItems = _toc.querySelectorAll('.toc-item');
    headings = headingElements;

    tocItems.forEach(item => {
      item.addEventListener('click', e => {
        e.stopPropagation();
        const targetId = item.dataset.target;
        if (!targetId) {
          return;
        }

        if (item.dataset.level === '3') {
          const wasExpanded = item.classList.contains('expanded');
          tocItems.forEach(other => {
            if (other.dataset.level === '3') {
              other.classList.remove('expanded');
            }
          });
          if (!wasExpanded) {
            item.classList.add('expanded');
          }
        }

        _Bus.emit('toc:jump', { id: targetId });
      });
    });

    updateTOCHighlight();
  }

  function init(deps) {
    _editor = deps.editor;
    _toc = deps.toc;
    _preview = deps.preview;
    _AppState = deps.AppState;
    _Bus = deps.Bus;
    _Preview = deps.Preview;
    _Layout = deps.Layout;

    const ownerDoc = (_editor && _editor.ownerDocument) || document;
    ownerDoc.addEventListener('pointerdown', markHeadingHighlightActivation, true);
    ownerDoc.addEventListener('keydown', markHeadingHighlightActivation, true);
    ownerDoc.addEventListener('touchstart', markHeadingHighlightActivation, true);

    _Bus.on('toc:jump', event => {
      if (!event || typeof event.id !== 'string') {
        return;
      }
      if (_Preview && typeof _Preview.clearHeadingHighlight === 'function') {
        _Preview.clearHeadingHighlight();
      }
      pendingHeadingAlignmentId = event.id;
      pendingHeadingHighlightId = event.id;
      const headingInfo = headingInfoById.get(event.id);
      const previewDetail = getPreviewScrollTargetForHeading(event.id);
      if (headingInfo) {
        if (_AppState.getSettings().mode !== 'read') {
          focusEditorOnHeading(headingInfo, previewDetail);
        } else if (_editor) {
          if (typeof _editor.setSelectionRange === 'function') {
            _editor.setSelectionRange(headingInfo.start, headingInfo.start);
          } else {
            _editor.selectionStart = _editor.selectionEnd = headingInfo.start;
          }
        }
      }
      setActiveTocItem(event.id);
      if (_Preview && typeof _Preview.scrollToHeading === 'function') {
        _Preview.scrollToHeading(event.id);
      }
    });

    _Bus.on('preview:scrolled', detail => {
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
          _Layout.flashEditorHeading(headingInfo);
        }
        if (
          hasUserActivatedHeadingHighlight &&
          _Preview &&
          typeof _Preview.highlightHeading === 'function'
        ) {
          _Preview.highlightHeading(detail.id);
        }
      }
    });
  }

  global.Toc = {
    init,
    buildTOC,
    updateTOCHighlight,
  };

}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
