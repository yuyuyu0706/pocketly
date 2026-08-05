(function (global) {
  'use strict';

  let _editor = null;
  let _i18n = null;
  let _Layout = null;
  let _AppState = null;

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
  let _activeListenerDoc = null;
  let _activeListenerWin = null;

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
      _editor.focus({ preventScroll: true });
    } catch (_) {
      _editor.focus();
    }
    _editor.selectionStart = start;
    _editor.selectionEnd = end;
    const ownerDoc = _editor.ownerDocument || document;
    const ok = ownerDoc.execCommand('insertText', false, text);
    if (!ok) {
      _editor.value = _editor.value.slice(0, start) + text + _editor.value.slice(end);
    }
  }

  function insertTextAtCursor(text) {
    if (!_editor || typeof text !== 'string') {
      return;
    }

    const value = _editor.value || '';
    const start = Math.min(_editor.selectionStart || 0, _editor.selectionEnd || 0);
    const end = Math.max(_editor.selectionStart || 0, _editor.selectionEnd || 0);
    const previousScrollTop = _editor.scrollTop;
    const before = value.slice(0, start);
    const nextValue = `${before}${text}${value.slice(end)}`;
    const nextCaret = before.length + text.length;

    replaceEditorRange(start, end, text);
    _editor.scrollTop = previousScrollTop;
    _editor.selectionStart = nextCaret;
    _editor.selectionEnd = nextCaret;

    _Layout.updateEditorHighlight(nextValue);
    _AppState.setText(nextValue, 'editor');
    _Layout.updateLineNumbers();

    try {
      _editor.focus({ preventScroll: true });
    } catch (error) {
      _editor.focus();
    }
  }

  function normalizePlainTextValue(text) {
    if (typeof text !== 'string') {
      return '';
    }
    return text.replace(/\r\n?/g, '\n');
  }

  async function pasteClipboardText() {
    if (!_editor) {
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
    if (!_editor) {
      return 0;
    }
    return Math.abs(_editor.selectionEnd - _editor.selectionStart);
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

    const ownerDoc = (_editor && _editor.ownerDocument) || document;
    const ownerWin = ownerDoc.defaultView || window;
    bindDismissListeners(ownerDoc, ownerWin);

    refreshClipboardState();
    updateFormattingMenuState();

    const scrollX = ownerWin.pageXOffset || ownerWin.scrollX || 0;
    const scrollY = ownerWin.pageYOffset || ownerWin.scrollY || 0;
    const viewportPadding = 8;

    let targetLeft = scrollX + clientX;
    let targetTop = scrollY + clientY;

    formattingMenuElement.classList.add('visible');
    formattingMenuElement.style.visibility = 'hidden';
    formattingMenuElement.style.left = `${targetLeft}px`;
    formattingMenuElement.style.top = `${targetTop}px`;

    const rect = formattingMenuElement.getBoundingClientRect();
    const viewportRight = scrollX + ownerWin.innerWidth;
    const viewportBottom = scrollY + ownerWin.innerHeight;

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
    if (!_editor) {
      return;
    }

    const start = _editor.selectionStart;
    const end = _editor.selectionEnd;

    if (typeof start !== 'number' || typeof end !== 'number') {
      return;
    }

    const selectionStart = Math.min(start, end);
    const selectionEnd = Math.max(start, end);
    const previousValue = _editor.value || '';
    const selectedText = previousValue.slice(selectionStart, selectionEnd);
    const prevScrollTop = _editor.scrollTop;

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
    _editor.scrollTop = prevScrollTop;
    _editor.selectionStart = nextSelectionStart;
    _editor.selectionEnd = nextSelectionEnd;

    _Layout.updateEditorHighlight(nextValue);
    _AppState.setText(nextValue, 'editor');
    _Layout.updateLineNumbers();

    try {
      _editor.focus({ preventScroll: true });
    } catch (error) {
      _editor.focus();
    }
  }

  function applyExternalLinkFormatting() {
    if (!_editor) {
      return;
    }

    const start = _editor.selectionStart;
    const end = _editor.selectionEnd;
    if (typeof start !== 'number' || typeof end !== 'number') {
      return;
    }

    const selectionStart = Math.min(start, end);
    const selectionEnd = Math.max(start, end);
    const previousValue = _editor.value || '';
    const selectedText = previousValue.slice(selectionStart, selectionEnd);
    const prevScrollTop = _editor.scrollTop;

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
    _editor.scrollTop = prevScrollTop;
    _editor.selectionStart = nextSelectionStart;
    _editor.selectionEnd = nextSelectionEnd;

    _Layout.updateEditorHighlight(nextValue);
    _AppState.setText(nextValue, 'editor');
    _Layout.updateLineNumbers();

    try {
      _editor.focus({ preventScroll: true });
    } catch (error) {
      _editor.focus();
    }
  }

  function applyBoldFormatting() {
    if (!_editor) {
      return;
    }
    const start = _editor.selectionStart;
    const end = _editor.selectionEnd;
    if (typeof start !== 'number' || typeof end !== 'number') {
      return;
    }

    const selectionStart = Math.min(start, end);
    const selectionEnd = Math.max(start, end);
    const previousValue = _editor.value || '';
    const selectedText = previousValue.slice(selectionStart, selectionEnd);
    const prevScrollTop = _editor.scrollTop;

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
    _editor.scrollTop = prevScrollTop;
    _editor.selectionStart = nextSelectionStart;
    _editor.selectionEnd = nextSelectionEnd;

    _Layout.updateEditorHighlight(nextValue);
    _AppState.setText(nextValue, 'editor');
    _Layout.updateLineNumbers();

    try {
      _editor.focus({ preventScroll: true });
    } catch (error) {
      _editor.focus();
    }
  }

  function copyEditorSelection() {
    if (!_editor) {
      return;
    }

    const start = _editor.selectionStart;
    const end = _editor.selectionEnd;
    if (typeof start !== 'number' || typeof end !== 'number') {
      return;
    }

    const selectionStart = Math.min(start, end);
    const selectionEnd = Math.max(start, end);
    if (selectionStart === selectionEnd) {
      return;
    }

    const selectedText = (_editor.value || '').slice(selectionStart, selectionEnd);
    if (!selectedText) {
      return;
    }

    const collapseSelection = () => {
      _editor.selectionStart = selectionEnd;
      _editor.selectionEnd = selectionEnd;
    };

    const attemptExecCommandCopy = () => {
      const ownerDoc = _editor.ownerDocument || document;
      const activeElement = ownerDoc.activeElement;
      try {
        try {
          _editor.focus({ preventScroll: true });
        } catch (focusError) {
          _editor.focus();
        }
        ownerDoc.execCommand('copy');
      } catch (error) {
        // Ignore copy errors to avoid interrupting the user experience.
      } finally {
        collapseSelection();
        if (
          activeElement &&
          activeElement !== _editor &&
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
    if (!_editor) {
      return;
    }

    const start = _editor.selectionStart;
    const end = _editor.selectionEnd;
    if (typeof start !== 'number' || typeof end !== 'number') {
      return;
    }

    const selectionStart = Math.min(start, end);
    const selectionEnd = Math.max(start, end);
    if (selectionStart === selectionEnd) {
      return;
    }

    const selectedText = (_editor.value || '').slice(selectionStart, selectionEnd);
    if (!selectedText) {
      return;
    }

    const removeSelection = () => {
      const value = _editor.value || '';
      const before = value.slice(0, selectionStart);
      const after = value.slice(selectionEnd);
      const nextValue = `${before}${after}`;
      const nextCaret = before.length;

      replaceEditorRange(selectionStart, selectionEnd, '');
      _editor.selectionStart = nextCaret;
      _editor.selectionEnd = nextCaret;

      _Layout.updateEditorHighlight(nextValue);
      _AppState.setText(nextValue, 'editor');
      _Layout.updateLineNumbers();

      try {
        _editor.focus({ preventScroll: true });
      } catch (error) {
        _editor.focus();
      }
    };

    const attemptExecCommandCopy = () => {
      const ownerDoc = _editor.ownerDocument || document;
      const activeElement = ownerDoc.activeElement;
      try {
        try {
          _editor.focus({ preventScroll: true });
        } catch (focusError) {
          _editor.focus();
        }
        ownerDoc.execCommand('copy');
      } catch (error) {
        // Ignore copy errors to avoid interrupting the user experience.
      } finally {
        if (
          activeElement &&
          activeElement !== _editor &&
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
    if (!_editor) {
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

  function unbindDismissListeners() {
    if (_activeListenerDoc) {
      _activeListenerDoc.removeEventListener('mousedown', handleDocumentPointerDown, true);
      _activeListenerDoc.removeEventListener('scroll', handleDocumentScroll, true);
      _activeListenerDoc.removeEventListener('keydown', handleDocumentKeyDown, true);
    }
    if (_activeListenerWin) {
      _activeListenerWin.removeEventListener('resize', hideFormattingMenu);
    }
    _activeListenerDoc = null;
    _activeListenerWin = null;
  }

  function bindDismissListeners(doc, win) {
    if (_activeListenerDoc === doc && _activeListenerWin === win) {
      return;
    }
    unbindDismissListeners();
    if (doc) {
      doc.addEventListener('mousedown', handleDocumentPointerDown, true);
      doc.addEventListener('scroll', handleDocumentScroll, true);
      doc.addEventListener('keydown', handleDocumentKeyDown, true);
    }
    if (win) {
      win.addEventListener('resize', hideFormattingMenu);
    }
    _activeListenerDoc = doc;
    _activeListenerWin = win;
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

    const { selectionStart, selectionEnd, value } = _editor;

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
    const prevScrollTop = _editor.scrollTop;

    replaceEditorRange(selectionStart, selectionStart + spaceOffset, insertion);
    _editor.scrollTop = prevScrollTop;
    _editor.selectionStart = _editor.selectionEnd = newCursorPos;

    _Layout.updateEditorHighlight(_editor.value);
    _AppState.setText(_editor.value, 'editor');

    return true;
  }

  function onEditorKeydown(event) {
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

    continueListOnEnter(event);
  }

  function initializeFormattingMenu() {
    if (!_editor || formattingMenuElement) {
      return;
    }

    const ownerDoc = _editor.ownerDocument || document;
    const menu = ownerDoc.createElement('div');
    menu.id = 'formatting-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-hidden', 'true');

    const boldButton = ownerDoc.createElement('button');
    boldButton.type = 'button';
    boldButton.className = 'formatting-menu-button';
    boldButton.dataset.action = 'bold';
    boldButton.dataset.i18n = 'formatting.bold';
    boldButton.setAttribute('role', 'menuitem');
    boldButton.textContent = _i18n.t('formatting.bold');
    boldButton.addEventListener('click', () => {
      applyBoldFormatting();
      hideFormattingMenu();
    });

    const inlineCodeButton = ownerDoc.createElement('button');
    inlineCodeButton.type = 'button';
    inlineCodeButton.className = 'formatting-menu-button';
    inlineCodeButton.dataset.action = 'inline-code';
    inlineCodeButton.dataset.i18n = 'formatting.inlineCode';
    inlineCodeButton.setAttribute('role', 'menuitem');
    inlineCodeButton.textContent = _i18n.t('formatting.inlineCode');
    inlineCodeButton.addEventListener('click', () => {
      applyInlineCodeFormatting();
      hideFormattingMenu();
    });

    const externalLinkButton = ownerDoc.createElement('button');
    externalLinkButton.type = 'button';
    externalLinkButton.className = 'formatting-menu-button';
    externalLinkButton.dataset.action = 'external-link';
    externalLinkButton.dataset.i18n = 'formatting.externalLink';
    externalLinkButton.setAttribute('role', 'menuitem');
    externalLinkButton.textContent = _i18n.t('formatting.externalLink');
    externalLinkButton.addEventListener('click', () => {
      applyExternalLinkFormatting();
      hideFormattingMenu();
    });

    const copyButton = ownerDoc.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'formatting-menu-button';
    copyButton.dataset.action = 'copy';
    copyButton.dataset.i18n = 'formatting.copy';
    copyButton.setAttribute('role', 'menuitem');
    copyButton.textContent = _i18n.t('formatting.copy');
    copyButton.addEventListener('click', () => {
      copyEditorSelection();
      hideFormattingMenu();
    });

    const cutButton = ownerDoc.createElement('button');
    cutButton.type = 'button';
    cutButton.className = 'formatting-menu-button';
    cutButton.dataset.action = 'cut';
    cutButton.dataset.i18n = 'formatting.cut';
    cutButton.setAttribute('role', 'menuitem');
    cutButton.textContent = _i18n.t('formatting.cut');
    cutButton.addEventListener('click', () => {
      cutEditorSelection();
      hideFormattingMenu();
    });

    const pasteButton = ownerDoc.createElement('button');
    pasteButton.type = 'button';
    pasteButton.className = 'formatting-menu-button';
    pasteButton.dataset.action = 'paste';
    pasteButton.dataset.i18n = 'formatting.paste';
    pasteButton.setAttribute('role', 'menuitem');
    pasteButton.textContent = _i18n.t('formatting.paste');
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
    ownerDoc.body.appendChild(menu);
    _i18n.applyToDOM(menu);

    formattingMenuElement = menu;
    formattingBoldButton = boldButton;
    formattingExternalLinkButton = externalLinkButton;
    formattingCopyButton = copyButton;
    formattingCutButton = cutButton;
    formattingPasteButton = pasteButton;

    updateFormattingMenuState();

    _editor.addEventListener('contextmenu', handleEditorContextMenu);
    _editor.addEventListener('mouseup', handleEditorMouseUp);
    _editor.addEventListener('select', handleEditorSelect);
    _editor.addEventListener('blur', handleEditorBlur);

    bindDismissListeners(ownerDoc, ownerDoc.defaultView || window);
  }

  function init(deps) {
    _editor = deps.editor;
    _i18n = deps.i18n;
    _Layout = deps.Layout;
    _AppState = deps.AppState;

    initializeFormattingMenu();
  }

  global.Formatting = {
    init,
    hideFormattingMenu,
    replaceEditorRange,
    onEditorKeydown,
    getFormattingMenuElement: () => formattingMenuElement,
  };

  // Expose private helpers for unit testing via window.__formattingTest
  global.__formattingTest = {
    replaceEditorRange,
    showFormattingMenu,
    getFormattingMenuVisible: () => formattingMenuVisible,
    getOwnerDoc: () => _editor && _editor.ownerDocument,
  };

}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
