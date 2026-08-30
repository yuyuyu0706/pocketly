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
   * Open a small fixed-position menu at the mouse cursor (clientX/clientY),
   * closed on the next click elsewhere or Escape. Shared by filetree.js and
   * tabs.js (Issue #225 / MEW-041 候補F: moved here from filetree.js with
   * the logic itself unchanged; Issue #225 follow-up: positioning switched
   * from the right-clicked element's bounding box to the cursor coordinates).
   * @param {number} clientX
   * @param {number} clientY
   * @param {Document} ownerDocument
   * @param {Array<{ label: string, onSelect: () => void }>} items
   */
  function openMenuFor(clientX, clientY, ownerDocument, items) {
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

    // Appended to <body> (viewport-fixed), not the right-clicked element's
    // container: #file-tree lives inside #toc, a position:sticky element
    // that forms its own stacking context, so a z-index set on a menu
    // appended there only wins against other #toc descendants —
    // #toc-divider (a sibling of #toc) still drew on top regardless of
    // z-index. Escaping to <body> avoids that stacking context entirely.
    menu.style.position = 'fixed';
    // Hidden while off-DOM sizing is read below, to avoid a one-frame flash
    // at the wrong (pre-flip) position.
    menu.style.visibility = 'hidden';
    ownerDocument.body.appendChild(menu);

    const win = ownerDocument.defaultView;
    const menuWidth = menu.offsetWidth;
    let left = clientX;
    if (left + menuWidth > win.innerWidth) {
      left = Math.max(0, clientX - menuWidth);
    }
    menu.style.left = `${left}px`;
    menu.style.top = `${clientY}px`;
    menu.style.visibility = '';
    _activeMenu = menu;

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
