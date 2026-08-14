(function (global) {
  'use strict';

  // Quick switcher (Issue #191 / MEW-013): a Ctrl+P modal that lists every
  // switchable document -- both documents AppState already tracks (open tabs,
  // the fallback Welcome doc) and directory-backed files that have never been
  // opened as a tab (Directory.getTree()) -- and activates the chosen one via
  // Directory.activateDocument(), reusing its "reopen from fileRegistry if
  // AppState forgot it" fallback (Issue #181 / MEW-012 Lv2-8).

  let _AppState = null;
  let _Directory = null;
  let _root = null;      // modal backdrop element
  let _input = null;
  let _list = null;
  let _results = [];
  let _selectedIndex = -1;
  let _ownerDocument = null;
  let _previouslyFocused = null;

  function labelFor(doc) {
    const name = doc && doc.meta && doc.meta.name;
    return typeof name === 'string' && name ? name : i18n.t('tabs.untitled');
  }

  /**
   * Merge AppState.listDocuments() and Directory.getTree() into a single
   * deduped list of switchable documents, keyed by id. AppState entries win
   * when the same id appears in both (Directory.getTree() ids for files that
   * have already been activated are also present in AppState.listDocuments()).
   * @returns {Array<{id: string, label: string}>}
   */
  function getAllSwitchableDocuments() {
    const seen = new Map();
    _AppState.listDocuments().forEach(doc => {
      seen.set(doc.id, { id: doc.id, label: labelFor(doc) });
    });
    _Directory.getTree().forEach(entry => {
      if (!seen.has(entry.id)) {
        seen.set(entry.id, { id: entry.id, label: entry.path });
      }
    });
    return Array.from(seen.values());
  }

  /**
   * Minimal case-insensitive fuzzy match: every character of `query` must
   * appear in `text`, in order, allowing gaps. Empty query matches everything.
   * @param {string} query
   * @param {string} text
   * @returns {boolean}
   */
  function fuzzyMatch(query, text) {
    if (!query) {
      return true;
    }
    const q = query.toLowerCase();
    const t = text.toLowerCase();
    let qi = 0;
    for (let ti = 0; ti < t.length && qi < q.length; ti += 1) {
      if (t[ti] === q[qi]) {
        qi += 1;
      }
    }
    return qi === q.length;
  }

  function computeResults(query) {
    const all = getAllSwitchableDocuments();
    if (!query) {
      return all;
    }
    // Prefer substring matches (more predictable), fall back to fuzzy.
    const substring = all.filter(doc => doc.label.toLowerCase().includes(query.toLowerCase()));
    if (substring.length) {
      return substring;
    }
    return all.filter(doc => fuzzyMatch(query, doc.label));
  }

  /**
   * Rebuild the <li> elements for the current _results. Only call this when
   * the result set itself changes (query edits, open()) -- NOT on every
   * selection change. Selection-only changes (hover, arrow keys) must go
   * through updateSelectionClasses() instead: rebuilding the DOM on
   * mouseenter replaces the element the pointer is over, which makes the
   * browser fire a fresh mouseenter on the replacement and rebuild again,
   * looping indefinitely under a stationary pointer and starving the
   * mousedown/click pair of a stable target (click never fires; the modal
   * never closes). See Issue #191 follow-up bug report #1.
   */
  function renderResults() {
    if (!_list || !_ownerDocument) {
      return;
    }
    _list.innerHTML = '';
    _results.forEach((doc, index) => {
      const item = _ownerDocument.createElement('li');
      item.className = 'quickswitcher-item';
      item.classList.toggle('selected', index === _selectedIndex);

      const icon = _ownerDocument.createElement('span');
      icon.className = 'quickswitcher-item-icon';
      icon.textContent = '📄';
      icon.setAttribute('aria-hidden', 'true');
      item.appendChild(icon);

      const label = _ownerDocument.createElement('span');
      label.className = 'quickswitcher-item-label';
      label.textContent = doc.label;
      item.appendChild(label);

      item.dataset.id = doc.id;

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

  /**
   * Update the 'selected' class on the already-rendered <li> elements to
   * match _selectedIndex, without touching element identity/listeners.
   * Used by hover and arrow-key navigation so the DOM stays stable.
   */
  function updateSelectionClasses() {
    if (!_list) {
      return;
    }
    Array.prototype.forEach.call(_list.children, (item, index) => {
      item.classList.toggle('selected', index === _selectedIndex);
    });
  }

  function updateResults() {
    const query = _input ? _input.value : '';
    _results = computeResults(query);
    if (_results.length === 0) {
      _selectedIndex = -1;
    } else if (_selectedIndex < 0 || _selectedIndex >= _results.length) {
      _selectedIndex = 0;
    }
    renderResults();
  }

  function confirmSelection(index) {
    const doc = _results[index];
    if (!doc) {
      return;
    }
    _Directory.activateDocument(doc.id);
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
   * element, so the quick switcher renders correctly in a PiP/popout window
   * too (Charter §9-2 / window-and-multi-window.md).
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
    _root.id = 'quickswitcher';
    _root.className = 'hidden';
    _root.addEventListener('click', handleBackdropClick);

    const panel = ownerDocument.createElement('div');
    panel.id = 'quickswitcher-panel';

    _input = ownerDocument.createElement('input');
    _input.type = 'text';
    _input.id = 'quickswitcher-input';
    _input.setAttribute('placeholder', i18n.t('quickswitcher.placeholder'));
    _input.addEventListener('input', () => {
      _selectedIndex = -1;
      updateResults();
    });
    _input.addEventListener('keydown', handleKeydown);

    _list = ownerDocument.createElement('ul');
    _list.id = 'quickswitcher-list';

    const footer = ownerDocument.createElement('div');
    footer.className = 'quickswitcher-footer';

    const moveHint = ownerDocument.createElement('span');
    moveHint.innerHTML = '↑↓ <span data-i18n="quickswitcher.move"></span>';
    footer.appendChild(moveHint);

    const selectHint = ownerDocument.createElement('span');
    selectHint.innerHTML = 'Enter <span data-i18n="quickswitcher.select"></span>';
    footer.appendChild(selectHint);

    const dismissHint = ownerDocument.createElement('span');
    dismissHint.innerHTML = 'Esc <span data-i18n="quickswitcher.dismiss"></span>';
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
   * Open the quick switcher modal, anchored to the given element's document
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
    updateResults();
    _input.focus();
  }

  function close() {
    if (!_root || _root.classList.contains('hidden')) {
      return;
    }
    _root.classList.add('hidden');
    if (_previouslyFocused && typeof _previouslyFocused.focus === 'function') {
      _previouslyFocused.focus();
    }
    _previouslyFocused = null;
  }

  /**
   * Wire the quick switcher to AppState/Directory.
   * @param {{ AppState: object, Directory: object }} deps
   */
  function init(deps) {
    _AppState = deps.AppState;
    _Directory = deps.Directory;
  }

  // Expose internals for testing.
  global.__quickswitcherTest = {
    getAllSwitchableDocuments: () => getAllSwitchableDocuments(),
    fuzzyMatch
  };

  global.QuickSwitcher = {
    init,
    open,
    close,
    getAllSwitchableDocuments
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
