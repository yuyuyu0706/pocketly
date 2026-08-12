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

  function renderNodeList(nodes, ownerDocument, ctx) {
    const ul = ownerDocument.createElement('ul');
    ul.className = 'file-tree-list';

    nodes.forEach(node => {
      const li = ownerDocument.createElement('li');
      li.className = 'file-tree-item';

      const label = ownerDocument.createElement('span');
      label.className = 'file-tree-label';
      label.textContent = node.name;
      label.setAttribute('role', 'button');
      label.tabIndex = 0;

      if (node.type === 'folder') {
        li.classList.add('file-tree-folder');
        const isOpen = ctx.openFolders.has(node.path);
        li.classList.toggle('open', isOpen);
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

        li.appendChild(label);
        if (isOpen && node.children.length) {
          li.appendChild(renderNodeList(node.children, ownerDocument, ctx));
        }
      } else {
        li.classList.add('file-tree-file');
        li.dataset.id = node.id;

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

        li.appendChild(label);
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
    return entries.map(entry => entry.id).sort().join('|');
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

  function render(treeNodes) {
    _container.innerHTML = '';
    if (!treeNodes.length) {
      _container.classList.add('hidden');
      return;
    }
    _container.classList.remove('hidden');
    const ownerDocument = _container.ownerDocument || document;
    const ctx = { openFolders, Directory: _Directory, rerender };
    _container.appendChild(renderNodeList(treeNodes, ownerDocument, ctx));
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
    handleTextChanged();
  }

  global.FileTree = {
    init,
    buildTreeStructure
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
