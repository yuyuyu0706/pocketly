(function (global) {
  'use strict';

  // Tabs shown in the tab bar are documents the user has explicitly activated
  // (via the file tree or a tab click), NOT every document AppState currently
  // tracks. This mirrors the "navigation content is exempt from N_read" principle
  // (Charter §3-3): the tab bar grows/shrinks with what the reader has opened,
  // it is not a fixed operational control.
  const openTabIds = new Set();

  let _container = null;
  let _Directory = null;
  let _Bus = null;
  let _AppState = null;

  function labelFor(id) {
    const doc = _AppState.listDocuments().find(d => d.id === id);
    const name = doc && doc.meta && doc.meta.name;
    return typeof name === 'string' && name ? name : i18n.t('tabs.untitled');
  }

  function render() {
    if (!_container) {
      return;
    }
    const ownerDocument = _container.ownerDocument || document;
    const activeId = _AppState.getActiveDocumentId();

    _container.innerHTML = '';
    openTabIds.forEach(id => {
      const tab = ownerDocument.createElement('div');
      tab.className = 'tab-bar-item';
      tab.dataset.id = id;
      tab.classList.toggle('active', id === activeId);
      tab.setAttribute('role', 'button');
      tab.tabIndex = 0;

      const label = ownerDocument.createElement('span');
      label.className = 'tab-bar-label';
      label.textContent = labelFor(id);
      tab.appendChild(label);

      const closeBtn = ownerDocument.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'tab-bar-close';
      closeBtn.textContent = '×';
      closeBtn.setAttribute('aria-label', i18n.t('tabs.close'));
      tab.appendChild(closeBtn);

      const activate = () => {
        _Directory.activateDocument(id);
      };
      tab.addEventListener('click', activate);
      tab.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      });

      closeBtn.addEventListener('click', event => {
        event.stopPropagation();
        closeTab(id);
      });

      _container.appendChild(tab);
    });
  }

  /**
   * Close a tab: drop it from openTabIds, close it in AppState, and re-render.
   * If it was the active tab, AppState.closeDocument() already transitions the
   * active document to an adjacent/remaining one; this just keeps the tab bar
   * in sync with that transition.
   * @param {string} id
   * @returns {void}
   */
  function closeTab(id) {
    openTabIds.delete(id);
    _AppState.closeDocument(id);
    render();
  }

  function handleTextChanged() {
    if (!_container) {
      return;
    }
    // Prune tabs for documents no longer tracked by AppState — e.g. Directory
    // replacing the workspace on folder import closes the previous documents
    // directly via AppState.closeDocument(), bypassing Tabs.closeTab().
    const liveIds = new Set(_AppState.listDocuments().map(doc => doc.id));
    Array.from(openTabIds).forEach(id => {
      if (!liveIds.has(id)) {
        openTabIds.delete(id);
      }
    });

    const activeId = _AppState.getActiveDocumentId();
    if (typeof activeId === 'string' && !openTabIds.has(activeId)) {
      openTabIds.add(activeId);
    }
    render();
  }

  /**
   * Wire the tab bar panel to Directory/Bus/AppState.
   * @param {{ container: HTMLElement, Directory: object, Bus: object, AppState: object }} deps
   */
  function init(deps) {
    _container = deps.container;
    _Directory = deps.Directory;
    _Bus = deps.Bus;
    _AppState = deps.AppState;

    if (!_container) {
      return;
    }

    _Bus.on('text:changed', handleTextChanged);
    handleTextChanged();
  }

  // Expose internals for testing via window.__tabsTest
  global.__tabsTest = {
    getOpenTabIds: () => Array.from(openTabIds)
  };

  global.Tabs = {
    init
  };
})(window);
