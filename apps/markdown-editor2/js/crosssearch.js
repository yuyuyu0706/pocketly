(function (global) {
  'use strict';

  // Cross-document search (Issue #193 / MEW-014): a Ctrl+Shift+F modal that
  // searches the cached text of every directory-backed document
  // (Directory.getSearchableDocuments()) plus the active document when it
  // isn't directory-backed (e.g. the fallback Welcome doc), and activates
  // the chosen result via Directory.activateDocument(), mirroring
  // js/quickswitcher.js's modal/keyboard-nav pattern (Issue #191 / MEW-013).

  const SEARCH_DEBOUNCE = 200; // Same debounce level as script.js's RENDER_DEBOUNCE.
  const SNIPPET_CONTEXT = 40; // Characters of context kept on each side of a match.
  const MAX_SNIPPETS_PER_RESULT = 3;

  let _AppState = null;
  let _Directory = null;
  let _root = null;      // modal backdrop element
  let _input = null;
  let _list = null;
  let _results = [];
  let _selectedIndex = -1;
  let _ownerDocument = null;
  let _previouslyFocused = null;
  let _debounceTimer = null;

  /**
   * Case-insensitive substring match. Returns every match offset (not fuzzy).
   * @param {string} text
   * @param {string} query
   * @returns {number[]}
   */
  function findMatches(text, query) {
    if (!text || !query) {
      return [];
    }
    const haystack = text.toLowerCase();
    const needle = query.toLowerCase();
    const offsets = [];
    let from = 0;
    let index = haystack.indexOf(needle, from);
    while (index !== -1) {
      offsets.push(index);
      from = index + needle.length;
      index = haystack.indexOf(needle, from);
    }
    return offsets;
  }

  /**
   * Build up to MAX_SNIPPETS_PER_RESULT context snippets around match
   * offsets, each as { before, match, after } text fragments truncated with
   * an ellipsis when the match isn't at the start/end of the document.
   * @param {string} text
   * @param {number[]} matches
   * @param {number} matchLength
   * @returns {Array<{ before: string, match: string, after: string }>}
   */
  function buildSnippets(text, matches, matchLength) {
    return matches.slice(0, MAX_SNIPPETS_PER_RESULT).map(offset => {
      const start = Math.max(0, offset - SNIPPET_CONTEXT);
      const end = Math.min(text.length, offset + matchLength + SNIPPET_CONTEXT);
      const before = (start > 0 ? '…' : '') + text.slice(start, offset);
      const match = text.slice(offset, offset + matchLength);
      const after = text.slice(offset + matchLength, end) + (end < text.length ? '…' : '');
      return { before, match, after };
    });
  }

  /**
   * Search every fileRegistry-tracked document plus the active document when
   * it isn't fileRegistry-tracked (mirrors js/directory.js exportWorkspaceAsZip's
   * "not tracked, but active" fallback).
   * @param {string} query
   * @returns {Array<{ id: string, path: string, snippets: Array<{before:string, match:string, after:string}> }>}
   */
  function searchAllDocuments(query) {
    if (!query) {
      return [];
    }
    const results = [];
    const searchable = _Directory.getSearchableDocuments();
    searchable.forEach(entry => {
      const matches = findMatches(entry.text, query);
      if (matches.length) {
        results.push({ id: entry.id, path: entry.path, snippets: buildSnippets(entry.text, matches, query.length) });
      }
    });

    const activeId = _AppState.getActiveDocumentId();
    const isTracked = searchable.some(entry => entry.id === activeId);
    if (activeId && !isTracked) {
      const text = _AppState.getText();
      const matches = findMatches(text, query);
      if (matches.length) {
        results.push({ id: activeId, path: i18n.t('tabs.untitled'), snippets: buildSnippets(text, matches, query.length) });
      }
    }
    return results;
  }

  function renderResults() {
    if (!_list || !_ownerDocument) {
      return;
    }
    _list.innerHTML = '';
    _results.forEach((result, index) => {
      const item = _ownerDocument.createElement('li');
      item.className = 'crosssearch-item';
      item.classList.toggle('selected', index === _selectedIndex);
      item.dataset.id = result.id;

      const pathRow = _ownerDocument.createElement('div');
      pathRow.className = 'crosssearch-item-path';

      const icon = _ownerDocument.createElement('i');
      icon.className = 'ti ti-file-text';
      icon.setAttribute('aria-hidden', 'true');
      pathRow.appendChild(icon);

      const pathLabel = _ownerDocument.createElement('span');
      pathLabel.textContent = result.path;
      pathRow.appendChild(pathLabel);

      item.appendChild(pathRow);

      const snippet = result.snippets[0];
      if (snippet) {
        const snippetRow = _ownerDocument.createElement('div');
        snippetRow.className = 'crosssearch-item-snippet';

        snippetRow.appendChild(_ownerDocument.createTextNode(snippet.before));

        const mark = _ownerDocument.createElement('mark');
        mark.textContent = snippet.match;
        snippetRow.appendChild(mark);

        snippetRow.appendChild(_ownerDocument.createTextNode(snippet.after));

        item.appendChild(snippetRow);
      }

      item.addEventListener('mouseenter', () => {
        _selectedIndex = index;
        updateSelectionClasses();
      });
      item.addEventListener('click', () => {
        confirmSelection(index);
      });

      _list.appendChild(item);
    });
  }

  function updateSelectionClasses() {
    if (!_list) {
      return;
    }
    Array.prototype.forEach.call(_list.children, (item, index) => {
      item.classList.toggle('selected', index === _selectedIndex);
    });
  }

  function runSearch() {
    const query = _input ? _input.value : '';
    _results = searchAllDocuments(query);
    if (_results.length === 0) {
      _selectedIndex = -1;
    } else if (_selectedIndex < 0 || _selectedIndex >= _results.length) {
      _selectedIndex = 0;
    }
    renderResults();
  }

  function scheduleSearch() {
    if (_debounceTimer) {
      clearTimeout(_debounceTimer);
    }
    _debounceTimer = setTimeout(runSearch, SEARCH_DEBOUNCE);
  }

  function confirmSelection(index) {
    const result = _results[index];
    if (!result) {
      return;
    }
    _Directory.activateDocument(result.id);
    close();
  }

  function moveSelection(delta) {
    if (!_results.length) {
      return;
    }
    _selectedIndex = (_selectedIndex + delta + _results.length) % _results.length;
    updateSelectionClasses();
  }

  function handleKeydown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      confirmSelection(_selectedIndex);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }

  function handleBackdropClick(event) {
    if (event.target === _root) {
      close();
    }
  }

  /**
   * Build the modal DOM (once) on the same document as the given anchor
   * element, so the modal renders correctly in a PiP/popout window too
   * (Charter §9-2 / window-and-multi-window.md).
   * @param {Document} ownerDocument
   */
  function ensureModal(ownerDocument) {
    if (_root && _ownerDocument === ownerDocument) {
      return;
    }
    if (_root && _root.parentNode) {
      _root.parentNode.removeChild(_root);
    }

    _ownerDocument = ownerDocument;

    _root = ownerDocument.createElement('div');
    _root.id = 'crosssearch';
    _root.className = 'hidden';
    _root.addEventListener('click', handleBackdropClick);

    const panel = ownerDocument.createElement('div');
    panel.id = 'crosssearch-panel';

    _input = ownerDocument.createElement('input');
    _input.type = 'text';
    _input.id = 'crosssearch-input';
    _input.setAttribute('placeholder', i18n.t('crosssearch.placeholder'));
    _input.addEventListener('input', () => {
      _selectedIndex = -1;
      scheduleSearch();
    });
    _input.addEventListener('keydown', handleKeydown);

    _list = ownerDocument.createElement('ul');
    _list.id = 'crosssearch-list';

    const footer = ownerDocument.createElement('div');
    footer.className = 'crosssearch-footer';

    const moveHint = ownerDocument.createElement('span');
    moveHint.innerHTML = '↑↓ <span data-i18n="crosssearch.move"></span>';
    footer.appendChild(moveHint);

    const selectHint = ownerDocument.createElement('span');
    selectHint.innerHTML = 'Enter <span data-i18n="crosssearch.select"></span>';
    footer.appendChild(selectHint);

    const dismissHint = ownerDocument.createElement('span');
    dismissHint.innerHTML = 'Esc <span data-i18n="crosssearch.dismiss"></span>';
    footer.appendChild(dismissHint);

    panel.appendChild(_input);
    panel.appendChild(_list);
    panel.appendChild(footer);
    _root.appendChild(panel);

    if (typeof i18n.applyToDOM === 'function') {
      i18n.applyToDOM(footer);
    } else {
      footer.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = i18n.t(el.getAttribute('data-i18n'));
      });
    }

    const body = ownerDocument.body || ownerDocument.documentElement;
    body.appendChild(_root);
  }

  /**
   * Open the cross-search modal, anchored to the given element's document
   * (defaults to the main window's document if none is provided/available).
   * @param {{ anchor?: Element }} [options]
   */
  function open(options) {
    if (!_AppState || !_Directory) {
      return;
    }
    const anchor = (options && options.anchor) || (global.document && global.document.body);
    const ownerDocument = (anchor && anchor.ownerDocument) || global.document;
    if (!ownerDocument) {
      return;
    }

    ensureModal(ownerDocument);

    _previouslyFocused = ownerDocument.activeElement;
    _root.classList.remove('hidden');
    _input.value = '';
    _selectedIndex = -1;
    _results = [];
    renderResults();
    _input.focus();
  }

  function close() {
    if (!_root || _root.classList.contains('hidden')) {
      return;
    }
    if (_debounceTimer) {
      clearTimeout(_debounceTimer);
      _debounceTimer = null;
    }
    _root.classList.add('hidden');
    if (_previouslyFocused && typeof _previouslyFocused.focus === 'function') {
      _previouslyFocused.focus();
    }
    _previouslyFocused = null;
  }

  /**
   * Wire the cross-search modal to AppState/Directory.
   * @param {{ AppState: object, Directory: object }} deps
   */
  function init(deps) {
    _AppState = deps.AppState;
    _Directory = deps.Directory;
  }

  // Expose internals for testing.
  global.__crosssearchTest = {
    findMatches,
    buildSnippets,
    searchAllDocuments: query => searchAllDocuments(query)
  };

  global.CrossSearch = {
    init,
    open,
    close,
    searchAllDocuments
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
