(function (global) {
  'use strict';

  const PROMOTED_NAME_PATTERN = /^(index|readme)\.md$/i;

  /**
   * Convert Directory.getTree()'s flat `{id, path, loaded}` list into a nested
   * folder/file structure, sorted per MEW-011 (folders before files, index.md/
   * README.md promoted to the top of their level, otherwise alphabetical).
   * @param {Array<{id: string, path: string, loaded: boolean}>} flatEntries
   * @returns {Array<object>} top-level tree nodes
   */
  function buildTreeStructure(flatEntries) {
    const root = { type: 'folder', name: '', path: '', children: [] };
    const folderMap = new Map([['', root]]);

    (flatEntries || []).forEach(entry => {
      if (typeof entry.path !== 'string' || !entry.path) {
        return;
      }
      const segments = entry.path.split('/');
      const fileName = segments[segments.length - 1];
      let parentPath = '';
      let parent = root;

      for (let i = 0; i < segments.length - 1; i += 1) {
        const segment = segments[i];
        const folderPath = parentPath ? `${parentPath}/${segment}` : segment;
        let folderNode = folderMap.get(folderPath);
        if (!folderNode) {
          folderNode = { type: 'folder', name: segment, path: folderPath, children: [] };
          folderMap.set(folderPath, folderNode);
          parent.children.push(folderNode);
        }
        parent = folderNode;
        parentPath = folderPath;
      }

      parent.children.push({
        type: 'file',
        name: fileName,
        path: entry.path,
        id: entry.id,
        loaded: entry.loaded
      });
    });

    sortTreeRecursive(root);
    return root.children;
  }

  function isPromotedName(name) {
    return PROMOTED_NAME_PATTERN.test(name);
  }

  function compareNodes(a, b) {
    if (a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1;
    }
    if (a.type === 'file') {
      const aPromoted = isPromotedName(a.name);
      const bPromoted = isPromotedName(b.name);
      if (aPromoted !== bPromoted) {
        return aPromoted ? -1 : 1;
      }
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  }

  function sortTreeRecursive(node) {
    if (!node.children) {
      return;
    }
    node.children.sort(compareNodes);
    node.children.forEach(child => {
      if (child.type === 'folder') {
        sortTreeRecursive(child);
      }
    });
  }

  function collectFolderPaths(nodes, out) {
    nodes.forEach(node => {
      if (node.type === 'folder') {
        out.add(node.path);
        collectFolderPaths(node.children, out);
      }
    });
  }

  // --- Inline create/rename + context menu state (Issue #196 / MEW-011 Lv3-1) ---
  // Module-scoped so a single active input/menu survives across the frequent
  // full-innerHTML re-renders triggered by text:changed/directory:changed.
  let pendingCreateFolder = null; // '' for root, a folder path, or null when inactive
  let pendingRenameId = null;
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
   * on the next click elsewhere or Escape.
   * @param {HTMLElement} anchorEl
   * @param {Document} ownerDocument
   * @param {Array<{ label: string, onSelect: () => void }>} items
   */
  function openMenuFor(anchorEl, ownerDocument, items) {
    closeMenu();
    const menu = ownerDocument.createElement('ul');
    menu.className = 'file-tree-menu';

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

    const containerRect = _container.getBoundingClientRect();
    const anchorRect = anchorEl.getBoundingClientRect();
    menu.style.left = `${anchorRect.left - containerRect.left}px`;
    menu.style.top = `${anchorRect.bottom - containerRect.top}px`;
    _container.appendChild(menu);
    _activeMenu = menu;

    const win = ownerDocument.defaultView;
    const onDocClick = () => closeMenu();
    const onKeydown = event => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };
    // Deferred so the click that opened the menu doesn't immediately close it.
    const timerId = win.setTimeout(() => {
      ownerDocument.addEventListener('click', onDocClick);
      ownerDocument.addEventListener('keydown', onKeydown);
    }, 0);
    _menuCleanup = () => {
      win.clearTimeout(timerId);
      ownerDocument.removeEventListener('click', onDocClick);
      ownerDocument.removeEventListener('keydown', onKeydown);
    };
  }

  function renderHeader(ownerDocument, ctx) {
    const header = ownerDocument.createElement('div');
    header.className = 'file-tree-header';

    const addBtn = ownerDocument.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'file-tree-add-btn';
    addBtn.setAttribute('aria-label', i18n.t('filetree.newFile'));
    addBtn.title = i18n.t('filetree.newFile');
    addBtn.textContent = '+';
    addBtn.addEventListener('click', event => {
      event.stopPropagation();
      ctx.startCreateAtRoot();
    });
    header.appendChild(addBtn);
    return header;
  }

  function renderCreateInput(ownerDocument, ctx, folderPath) {
    const li = ownerDocument.createElement('li');
    li.className = 'file-tree-item file-tree-create-item';

    const input = ownerDocument.createElement('input');
    input.type = 'text';
    input.className = 'file-tree-create-input';
    input.placeholder = i18n.t('filetree.newFilePlaceholder');
    input.addEventListener('click', event => event.stopPropagation());
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        ctx.submitCreate(folderPath, input.value);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        ctx.cancelCreate();
      }
    });
    input.addEventListener('blur', () => ctx.cancelCreate());

    const row = ownerDocument.createElement('div');
    row.className = 'file-tree-row';
    row.appendChild(input);
    li.appendChild(row);
    return li;
  }

  function renderRenameInput(ownerDocument, ctx, node) {
    const input = ownerDocument.createElement('input');
    input.type = 'text';
    input.className = 'file-tree-rename-input';
    input.value = node.name;
    input.addEventListener('click', event => event.stopPropagation());
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        ctx.submitRename(node.id, input.value);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        ctx.cancelRename();
      }
    });
    input.addEventListener('blur', () => ctx.submitRename(node.id, input.value));
    return input;
  }

  function renderNodeList(nodes, ownerDocument, ctx, folderPath) {
    const ul = ownerDocument.createElement('ul');
    ul.className = 'file-tree-list';

    if (ctx.pendingCreateFolder === folderPath) {
      ul.appendChild(renderCreateInput(ownerDocument, ctx, folderPath));
    }

    nodes.forEach(node => {
      const li = ownerDocument.createElement('li');
      li.className = 'file-tree-item';

      if (node.type === 'folder') {
        li.classList.add('file-tree-folder');
        const isOpen = ctx.openFolders.has(node.path);
        li.classList.toggle('open', isOpen);

        const row = ownerDocument.createElement('div');
        row.className = 'file-tree-row';

        const label = ownerDocument.createElement('span');
        label.className = 'file-tree-label';
        label.textContent = node.name;
        label.setAttribute('role', 'button');
        label.tabIndex = 0;
        label.setAttribute('aria-expanded', String(isOpen));

        const toggle = () => {
          if (ctx.openFolders.has(node.path)) {
            ctx.openFolders.delete(node.path);
          } else {
            ctx.openFolders.add(node.path);
          }
          ctx.rerender();
        };
        label.addEventListener('click', event => {
          event.stopPropagation();
          toggle();
        });
        label.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            toggle();
          }
        });

        const moreBtn = ownerDocument.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'file-tree-more-btn';
        moreBtn.setAttribute('aria-label', i18n.t('filetree.moreActions'));
        moreBtn.textContent = '…';
        moreBtn.addEventListener('click', event => {
          event.stopPropagation();
          ctx.openFolderMenu(node, moreBtn);
        });

        li.addEventListener('contextmenu', event => {
          event.preventDefault();
          event.stopPropagation();
          ctx.openFolderMenu(node, li);
        });

        row.appendChild(label);
        row.appendChild(moreBtn);
        li.appendChild(row);
        if (isOpen && (node.children.length || ctx.pendingCreateFolder === node.path)) {
          li.appendChild(renderNodeList(node.children, ownerDocument, ctx, node.path));
        }
      } else {
        li.classList.add('file-tree-file');
        li.dataset.id = node.id;

        if (ctx.pendingRenameId === node.id) {
          const renameRow = ownerDocument.createElement('div');
          renameRow.className = 'file-tree-row';
          renameRow.appendChild(renderRenameInput(ownerDocument, ctx, node));
          li.appendChild(renameRow);
          ul.appendChild(li);
          return;
        }

        const row = ownerDocument.createElement('div');
        row.className = 'file-tree-row';

        const label = ownerDocument.createElement('span');
        label.className = 'file-tree-label';
        label.textContent = node.name;
        label.setAttribute('role', 'button');
        label.tabIndex = 0;

        const activate = () => {
          ctx.Directory.activateDocument(node.id);
        };
        label.addEventListener('click', event => {
          event.stopPropagation();
          activate();
        });
        label.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            activate();
          }
        });

        const moreBtn = ownerDocument.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'file-tree-more-btn';
        moreBtn.setAttribute('aria-label', i18n.t('filetree.moreActions'));
        moreBtn.textContent = '…';
        moreBtn.addEventListener('click', event => {
          event.stopPropagation();
          ctx.openFileMenu(node, moreBtn);
        });

        li.addEventListener('contextmenu', event => {
          event.preventDefault();
          event.stopPropagation();
          ctx.openFileMenu(node, li);
        });

        row.appendChild(label);
        row.appendChild(moreBtn);
        li.appendChild(row);
      }

      ul.appendChild(li);
    });

    return ul;
  }

  let _container = null;
  let _Directory = null;
  let _Bus = null;
  let _AppState = null;
  const openFolders = new Set();
  let lastSignature = null;

  function computeSignature(entries) {
    return entries.map(entry => `${entry.id}:${entry.path}`).sort().join('|');
  }

  function updateActiveHighlight() {
    if (!_container) {
      return;
    }
    const activeId = _AppState.getActiveDocumentId();
    _container.querySelectorAll('.file-tree-file').forEach(li => {
      li.classList.toggle('active', li.dataset.id === activeId);
    });
  }

  function alertUser(reason) {
    const win = _container.ownerDocument.defaultView;
    const key = reason === 'duplicate' ? 'filetree.errorDuplicate' : 'filetree.errorInvalidExtension';
    if (win && typeof win.alert === 'function') {
      win.alert(i18n.t(key));
    }
  }

  function submitCreate(folderPath, rawValue) {
    const trimmed = typeof rawValue === 'string' ? rawValue.trim() : '';
    pendingCreateFolder = null;
    if (!trimmed) {
      rerender();
      return;
    }
    const fullPath = folderPath ? `${folderPath}/${trimmed}` : trimmed;
    const result = _Directory.createFile(fullPath);
    if (!result.created) {
      alertUser(result.reason);
      rerender();
      return;
    }
    _Directory.activateDocument(result.id);
    // Directory.createFile() emits Bus 'directory:changed' synchronously,
    // which triggers handleTextChanged() -> a fresh render() already; no
    // further action needed here.
  }

  function cancelCreate() {
    if (pendingCreateFolder === null) {
      return;
    }
    pendingCreateFolder = null;
    rerender();
  }

  function submitRename(id, rawValue) {
    const trimmed = typeof rawValue === 'string' ? rawValue.trim() : '';
    pendingRenameId = null;
    if (!trimmed) {
      rerender();
      return;
    }
    const result = _Directory.renameFile(id, trimmed);
    if (!result.renamed) {
      alertUser(result.reason === 'invalid-extension' ? 'invalid-extension' : result.reason);
      rerender();
      return;
    }
    // Directory.renameFile() emits Bus 'directory:changed' synchronously,
    // which triggers a fresh render() already; no further action needed here.
  }

  function cancelRename() {
    if (pendingRenameId === null) {
      return;
    }
    pendingRenameId = null;
    rerender();
  }

  function requestDelete(id) {
    closeMenu();
    const win = _container.ownerDocument.defaultView;
    if (!win.confirm(i18n.t('filetree.confirmDelete'))) {
      return;
    }
    _Directory.deleteFile(id);
  }

  function startCreateAtRoot() {
    pendingCreateFolder = '';
    rerender();
  }

  function startCreateHere(folderPath) {
    openFolders.add(folderPath);
    pendingCreateFolder = folderPath;
    closeMenu();
    rerender();
  }

  function startRename(id) {
    pendingRenameId = id;
    closeMenu();
    rerender();
  }

  function makeCtx() {
    return {
      openFolders,
      Directory: _Directory,
      rerender,
      pendingCreateFolder,
      pendingRenameId,
      startCreateAtRoot,
      startCreateHere,
      submitCreate,
      cancelCreate,
      startRename,
      submitRename,
      cancelRename,
      requestDelete,
      openFileMenu: (node, anchorEl) => {
        const ownerDocument = _container.ownerDocument || document;
        openMenuFor(anchorEl, ownerDocument, [
          { label: i18n.t('filetree.rename'), onSelect: () => startRename(node.id) },
          { label: i18n.t('filetree.delete'), onSelect: () => requestDelete(node.id) }
        ]);
      },
      openFolderMenu: (node, anchorEl) => {
        const ownerDocument = _container.ownerDocument || document;
        openMenuFor(anchorEl, ownerDocument, [
          { label: i18n.t('filetree.newFileHere'), onSelect: () => startCreateHere(node.path) }
        ]);
      }
    };
  }

  function focusPendingInput() {
    if (pendingCreateFolder !== null) {
      const input = _container.querySelector('.file-tree-create-input');
      if (input) {
        input.focus();
      }
      return;
    }
    if (pendingRenameId !== null) {
      const input = _container.querySelector('.file-tree-rename-input');
      if (input) {
        input.focus();
        input.select();
      }
    }
  }

  function render(treeNodes) {
    closeMenu();
    _container.innerHTML = '';
    const hasCreateAtRoot = pendingCreateFolder === '';
    if (!treeNodes.length && !hasCreateAtRoot) {
      _container.classList.add('hidden');
      return;
    }
    _container.classList.remove('hidden');
    const ownerDocument = _container.ownerDocument || document;
    const ctx = makeCtx();
    _container.appendChild(renderHeader(ownerDocument, ctx));
    _container.appendChild(renderNodeList(treeNodes, ownerDocument, ctx, ''));
    focusPendingInput();
  }

  function rerender() {
    const treeNodes = buildTreeStructure(_Directory.getTree());
    render(treeNodes);
    updateActiveHighlight();
  }

  function handleTextChanged() {
    if (!_container) {
      return;
    }
    const entries = _Directory.getTree();
    const signature = computeSignature(entries);
    if (signature !== lastSignature) {
      lastSignature = signature;
      const treeNodes = buildTreeStructure(entries);
      // Newly discovered folders (folder just opened / reopened) start expanded.
      collectFolderPaths(treeNodes, openFolders);
      render(treeNodes);
    }
    updateActiveHighlight();
  }

  /**
   * Wire the file tree panel to Directory/Bus/AppState.
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

    _container.classList.add('hidden');
    _Bus.on('text:changed', handleTextChanged);
    _Bus.on('directory:changed', handleTextChanged);
    handleTextChanged();
  }

  global.FileTree = {
    init,
    buildTreeStructure
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
