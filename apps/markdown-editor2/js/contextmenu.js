(function (global) {
  'use strict';

  let _activeMenu = null;
  let _menuCleanup = null;

  function closeMenu() {
    if (_activeMenu && _activeMenu.parentNode) {
      _activeMenu.parentNode.removeChild(_activeMenu);
    }
    _activeMenu = null;
    if (_menuCleanup) {
      _menuCleanup();
      _menuCleanup = null;
    }
  }

  /**
   * Open a small absolutely-positioned menu anchored under `anchorEl`, closed
   * on the next click elsewhere or Escape. Shared by filetree.js and tabs.js
   * (Issue #225 / MEW-041 候補F: moved here from filetree.js with the logic
   * itself unchanged).
   * @param {HTMLElement} anchorEl
   * @param {Document} ownerDocument
   * @param {Array<{ label: string, onSelect: () => void }>} items
   */
  function openMenuFor(anchorEl, ownerDocument, items) {
    closeMenu();
    const menu = ownerDocument.createElement('ul');
    menu.className = 'app-context-menu';

    items.forEach(({ label, onSelect }) => {
      const li = ownerDocument.createElement('li');
      const btn = ownerDocument.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.addEventListener('click', event => {
        event.stopPropagation();
        closeMenu();
        onSelect();
      });
      li.appendChild(btn);
      menu.appendChild(li);
    });

    // Appended to <body> (viewport-fixed), not the anchor's container:
    // #file-tree lives inside #toc, a position:sticky element that forms its
    // own stacking context, so a z-index set on a menu appended there only
    // wins against other #toc descendants — #toc-divider (a sibling of #toc)
    // still drew on top regardless of z-index. Escaping to <body> avoids
    // that stacking context entirely.
    const anchorRect = anchorEl.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.left = `${anchorRect.left}px`;
    menu.style.top = `${anchorRect.bottom}px`;
    ownerDocument.body.appendChild(menu);
    _activeMenu = menu;

    const win = ownerDocument.defaultView;
    const onDocClick = () => closeMenu();
    const onKeydown = event => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };
    // Deferred so the click that opened the menu doesn't immediately close it.
    // Registered on the capture phase: most callers' click handlers (label,
    // inputs) call stopPropagation() during the bubble phase, which would
    // otherwise prevent this listener from ever seeing clicks inside the
    // anchor's area. Capture fires on the way down, before those bubble-
    // phase stopPropagation() calls run, so the menu still closes.
    const timerId = win.setTimeout(() => {
      ownerDocument.addEventListener('click', onDocClick, true);
      ownerDocument.addEventListener('keydown', onKeydown);
    }, 0);
    _menuCleanup = () => {
      win.clearTimeout(timerId);
      ownerDocument.removeEventListener('click', onDocClick, true);
      ownerDocument.removeEventListener('keydown', onKeydown);
    };
  }

  global.ContextMenu = { open: openMenuFor, close: closeMenu };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
