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
  let pendingRenameFolderPath = null; // folder path currently being renamed, or null
  // Drag & drop move state (Issue #206 / MEW-041 Lv4-2). Module-scoped since
  // dataTransfer serialization is unnecessary for same-window drag/drop.
  let draggedItem = null; // { path, type: 'file'|'folder' } or null when idle
  let _clipboard = null; // { path, type: 'cut'|'copy', isFolder } or null when empty (Issue #221 / MEW-041 Lv3-2)

  // Copy-indicator fade-out (Issue #221 / MEW-041 Lv3-2 follow-up): the
  // dashed-outline copy indicator is a purely visual, time-limited cue,
  // separate from _clipboard itself (which stays intact so Ctrl+V keeps
  // working after the indicator fades) -- the same separation of "temporary
  // visual feedback" from "underlying state" as preview.js's
  // SEARCH_MATCH_FLASH_DURATION heading-flash.
  let _copyIndicatorTimer = null;
  let _showCopyIndicator = false;
  const COPY_INDICATOR_DURATION = 2500;

  function markCopyIndicator() {
    _showCopyIndicator = true;
    if (_copyIndicatorTimer) {
      clearTimeout(_copyIndicatorTimer);
    }
    _copyIndicatorTimer = setTimeout(() => {
      _showCopyIndicator = false;
      // render()/rerender() replace the tree's innerHTML wholesale, which
      // would swap in a fresh element with no outline instead of animating
      // an existing one's outline-color away -- so the fade is done as a
      // direct, targeted class removal on the live node(s) instead of a
      // full rerender().
      if (_container) {
        _container.querySelectorAll('.file-tree-item-copy').forEach(el => {
          el.classList.remove('file-tree-item-copy');
        });
      }
    }, COPY_INDICATOR_DURATION);
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

  function renderRenameFolderInput(ownerDocument, ctx, node) {
    const input = ownerDocument.createElement('input');
    input.type = 'text';
    input.className = 'file-tree-rename-input';
    input.value = node.name;
    input.addEventListener('click', event => event.stopPropagation());
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        ctx.submitRenameFolder(node.path, input.value);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        ctx.cancelRenameFolder();
      }
    });
    input.addEventListener('blur', () => ctx.submitRenameFolder(node.path, input.value));
    return input;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  // Heroicons v2 outline (MIT License, https://heroicons.com/): "folder" and
  // "document-text", copied verbatim from
  // https://github.com/tailwindlabs/heroicons (optimized/24/outline).
  const FOLDER_ICON_PATH =
    'M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z';
  const FILE_ICON_PATH =
    'M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z';
  // Heroicons v2 outline "chevron-right", copied verbatim from
  // https://github.com/tailwindlabs/heroicons (optimized/24/outline).
  // Replaces a text-glyph (▸) toggle arrow (Issue #223 follow-up):
  // the glyph's visual center didn't line up with its CSS box center, and
  // no amount of translateY tuning converged -- an SVG with an explicit
  // viewBox has no such ambiguity.
  const CHEVRON_RIGHT_ICON_PATH = 'm8.25 4.5 7.5 7.5-7.5 7.5';

  /**
   * Inline SVG icon (Heroicons outline style: stroke: currentColor, colored
   * via CSS) distinguishing folders from files in the tree (PR #197 review
   * feedback).
   * @param {Document} ownerDocument
   * @param {'folder'|'file'} type
   * @returns {SVGSVGElement}
   */
  function renderTreeIcon(ownerDocument, type) {
    const svg = ownerDocument.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'file-tree-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('aria-hidden', 'true');
    const path = ownerDocument.createElementNS(SVG_NS, 'path');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('d', type === 'folder' ? FOLDER_ICON_PATH : FILE_ICON_PATH);
    svg.appendChild(path);
    return svg;
  }

  /**
   * Inline SVG chevron used as the folder open/closed toggle indicator
   * (Issue #223 follow-up), drawn the same way as renderTreeIcon() so it
   * shares its stroke/viewBox conventions. Rotation between closed (▸) and
   * open (▼-equivalent) is applied purely via the .open CSS class.
   * @param {Document} ownerDocument
   * @returns {SVGSVGElement}
   */
  function renderToggleIcon(ownerDocument) {
    const svg = ownerDocument.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'file-tree-toggle-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('aria-hidden', 'true');
    const path = ownerDocument.createElementNS(SVG_NS, 'path');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('d', CHEVRON_RIGHT_ICON_PATH);
    svg.appendChild(path);
    return svg;
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

      // Visual feedback for the current clipboard entry (Issue #221 / MEW-041
      // Lv3-2): a cut item's icon is dimmed (see .file-tree-item-cut in
      // app.css; text stays full-strength to match OS file-explorer
      // conventions), a copy item's row gets a dashed outline.
      if (ctx.clipboard && ctx.clipboard.path === node.path && ctx.clipboard.isFolder === (node.type === 'folder')) {
        if (ctx.clipboard.type === 'cut') {
          li.classList.add('file-tree-item-cut');
        } else if (ctx.showCopyIndicator) {
          li.classList.add('file-tree-item-copy');
        }
      }

      li.draggable = true;
      li.addEventListener('dragstart', event => {
        event.stopPropagation();
        ctx.startDrag(node);
      });
      li.addEventListener('dragend', event => {
        event.stopPropagation();
        ctx.endDrag();
      });

      if (node.type === 'folder') {
        li.classList.add('file-tree-folder');
        const isOpen = ctx.openFolders.has(node.path);
        li.classList.toggle('open', isOpen);

        if (ctx.pendingRenameFolderPath === node.path) {
          const renameRow = ownerDocument.createElement('div');
          renameRow.className = 'file-tree-row';
          renameRow.appendChild(renderTreeIcon(ownerDocument, 'folder'));
          renameRow.appendChild(renderRenameFolderInput(ownerDocument, ctx, node));
          li.appendChild(renameRow);
          ul.appendChild(li);
          return;
        }

        const row = ownerDocument.createElement('div');
        row.className = 'file-tree-row';

        const label = ownerDocument.createElement('span');
        label.className = 'file-tree-label';
        label.textContent = node.name;
        label.dataset.path = node.path;
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
          } else if (event.key === 'F2') {
            event.preventDefault();
            event.stopPropagation();
            ctx.startRenameFolder(node.path);
          } else if (event.key === 'Delete') {
            event.preventDefault();
            event.stopPropagation();
            ctx.requestDeleteFolder(node.path);
          } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x') {
            event.preventDefault();
            event.stopPropagation();
            _clipboard = { path: node.path, type: 'cut', isFolder: true };
            _showCopyIndicator = false;
            if (_copyIndicatorTimer) {
              clearTimeout(_copyIndicatorTimer);
              _copyIndicatorTimer = null;
            }
            ctx.rerender();
          } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
            event.preventDefault();
            event.stopPropagation();
            _clipboard = { path: node.path, type: 'copy', isFolder: true };
            markCopyIndicator();
            ctx.rerender();
          } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
            event.preventDefault();
            event.stopPropagation();
            ctx.pasteClipboard(node);
          } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            event.stopPropagation();
            focusAdjacentLabel(label, 1);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            event.stopPropagation();
            focusAdjacentLabel(label, -1);
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            event.stopPropagation();
            if (!ctx.openFolders.has(node.path)) {
              toggle();
              focusLabelForPath(node.path);
            } else {
              const firstChildPath = findFirstChildPath(node);
              if (firstChildPath) {
                focusLabelForPath(firstChildPath);
              }
            }
          } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            event.stopPropagation();
            if (ctx.openFolders.has(node.path)) {
              toggle();
              focusLabelForPath(node.path);
            } else {
              const parentPath = parentPathOf(node.path);
              if (parentPath !== null) {
                focusLabelForPath(parentPath);
              }
            }
          }
        });

        li.addEventListener('contextmenu', event => {
          event.preventDefault();
          event.stopPropagation();
          ctx.openFolderMenu(node, event.clientX, event.clientY);
        });

        row.appendChild(renderToggleIcon(ownerDocument));
        row.appendChild(renderTreeIcon(ownerDocument, 'folder'));
        row.appendChild(label);
        li.appendChild(row);

        row.addEventListener('dragover', event => {
          if (!ctx.isValidDropTarget(node.path)) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          row.classList.add('file-tree-drop-target');
        });
        row.addEventListener('dragleave', event => {
          event.stopPropagation();
          row.classList.remove('file-tree-drop-target');
        });
        row.addEventListener('drop', event => {
          event.preventDefault();
          event.stopPropagation();
          row.classList.remove('file-tree-drop-target');
          ctx.dropOn(node.path);
        });

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
        label.dataset.path = node.path;
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
          } else if (event.key === 'F2') {
            event.preventDefault();
            event.stopPropagation();
            ctx.startRename(node.id);
          } else if (event.key === 'Delete') {
            event.preventDefault();
            event.stopPropagation();
            ctx.requestDelete(node.id);
          } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x') {
            event.preventDefault();
            event.stopPropagation();
            _clipboard = { path: node.path, type: 'cut', isFolder: false };
            _showCopyIndicator = false;
            if (_copyIndicatorTimer) {
              clearTimeout(_copyIndicatorTimer);
              _copyIndicatorTimer = null;
            }
            ctx.rerender();
          } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
            event.preventDefault();
            event.stopPropagation();
            _clipboard = { path: node.path, type: 'copy', isFolder: false };
            markCopyIndicator();
            ctx.rerender();
          } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
            event.preventDefault();
            event.stopPropagation();
            ctx.pasteClipboard(node);
          } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            event.stopPropagation();
            focusAdjacentLabel(label, 1);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            event.stopPropagation();
            focusAdjacentLabel(label, -1);
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            event.stopPropagation();
            // Files have no children to descend into.
          } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            event.stopPropagation();
            const parentPath = parentPathOf(node.path);
            if (parentPath !== null) {
              focusLabelForPath(parentPath);
            }
          }
        });

        li.addEventListener('contextmenu', event => {
          event.preventDefault();
          event.stopPropagation();
          ctx.openFileMenu(node, event.clientX, event.clientY);
        });

        row.appendChild(renderTreeIcon(ownerDocument, 'file'));
        row.appendChild(label);
        li.appendChild(row);

        // A file row is also a valid drop target: dropping onto a file
        // moves the dragged item into that file's parent folder (Issue
        // #206 follow-up). Reuses the same generic isValidDropTarget()/
        // dropOn(folderPath) used by folder rows/root — a drop onto a file
        // already inside the dragged folder is just the ordinary
        // startsWith()-based circular check applied to its parent path.
        const parentFolderPath = node.path.includes('/')
          ? node.path.slice(0, node.path.lastIndexOf('/'))
          : '';

        row.addEventListener('dragover', event => {
          if (!ctx.isValidDropTarget(parentFolderPath)) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          row.classList.add('file-tree-drop-target');
        });
        row.addEventListener('dragleave', event => {
          event.stopPropagation();
          row.classList.remove('file-tree-drop-target');
        });
        row.addEventListener('drop', event => {
          event.preventDefault();
          event.stopPropagation();
          row.classList.remove('file-tree-drop-target');
          ctx.dropOn(parentFolderPath);
        });
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
  // Every folder path ever seen in the tree, distinct from openFolders (the
  // subset currently expanded). Used to auto-expand only genuinely new
  // folders on a tree-structure change, without re-forcing open a folder the
  // user had deliberately collapsed (Issue #199 / MEW-041 Lv4-1: a rename,
  // for instance, changes the signature and must not reset collapse state).
  const knownFolderPaths = new Set();
  let lastSignature = null;

  function computeSignature(entries) {
    return entries.map(entry => `${entry.id}:${entry.path}`).sort().join('|');
  }

  /**
   * Move focus to the file-tree label for a logical item identified by
   * `path`, if currently rendered (Issue #223 / MEW-041 Lv3-3). Uses a
   * plain array search rather than an attribute-selector lookup so paths
   * containing characters that would need CSS escaping still match.
   * @param {string} path
   */
  function focusLabelForPath(path) {
    if (!_container) {
      return;
    }
    const labels = Array.from(_container.querySelectorAll('.file-tree-label'));
    const target = labels.find(el => el.dataset.path === path);
    if (target) {
      target.focus();
    }
  }

  /**
   * Move focus from `currentLabel` to the previous/next currently-visible
   * label in document order (Issue #223 / MEW-041 Lv3-3 ↑↓). Closed
   * folders never render their children, so `.file-tree-label` already
   * only ever contains the visible set -- no extra filtering needed.
   * @param {HTMLElement} currentLabel
   * @param {1|-1} direction
   */
  function focusAdjacentLabel(currentLabel, direction) {
    if (!_container) {
      return;
    }
    const labels = Array.from(_container.querySelectorAll('.file-tree-label'));
    const index = labels.indexOf(currentLabel);
    if (index === -1) {
      return;
    }
    const nextIndex = index + direction;
    if (nextIndex >= 0 && nextIndex < labels.length) {
      labels[nextIndex].focus();
    }
  }

  /**
   * Path of `path`'s parent folder ('' for the workspace root), or null if
   * `path` is already at the root (no parent to move focus to).
   * @param {string} path
   * @returns {string|null}
   */
  function parentPathOf(path) {
    return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : null;
  }

  /**
   * Path of the first child of an open folder `node`, or null if it has no
   * children (Issue #223 / MEW-041 Lv3-3 →).
   * @param {object} node
   * @returns {string|null}
   */
  function findFirstChildPath(node) {
    return node.children && node.children.length ? node.children[0].path : null;
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
    const key = reason === 'duplicate'
      ? 'filetree.errorDuplicate'
      : reason === 'invalid-name'
        ? 'filetree.errorInvalidName'
        : 'filetree.errorInvalidExtension';
    if (win && typeof win.alert === 'function') {
      win.alert(i18n.t(key));
    }
  }

  function alertFolderUser(reason) {
    const win = _container.ownerDocument.defaultView;
    const key = reason === 'duplicate' ? 'filetree.errorDuplicateFolder' : 'filetree.errorInvalidFolderName';
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
    const currentEntry = _Directory.getTree().find(entry => entry.id === id);
    const currentName = currentEntry ? currentEntry.path.split('/').pop() : null;
    pendingRenameId = null;
    if (!trimmed || trimmed === currentName) {
      // No change: treat like cancelRename() rather than calling renameFile(),
      // avoiding an unnecessary persist/directory:changed emission.
      rerender();
      return;
    }
    const result = _Directory.renameFile(id, trimmed);
    if (!result.renamed) {
      alertUser(result.reason);
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
    ContextMenu.close();
    const win = _container.ownerDocument.defaultView;
    if (!win.confirm(i18n.t('filetree.confirmDelete'))) {
      return;
    }
    _Directory.deleteFile(id);
  }

  function submitRenameFolder(folderPath, rawValue) {
    const trimmed = typeof rawValue === 'string' ? rawValue.trim() : '';
    const currentName = folderPath.includes('/') ? folderPath.slice(folderPath.lastIndexOf('/') + 1) : folderPath;
    pendingRenameFolderPath = null;
    if (!trimmed || trimmed === currentName) {
      // No change: treat like cancelRenameFolder() rather than calling
      // renameFolder(), avoiding an unnecessary persist/directory:changed emission.
      rerender();
      return;
    }
    const result = _Directory.renameFolder(folderPath, trimmed);
    if (!result.renamed) {
      alertFolderUser(result.reason === 'invalid-name' ? 'invalid-name' : result.reason);
      rerender();
      return;
    }
    // Directory.renameFolder() emits Bus 'directory:changed' synchronously,
    // which triggers handleTextChanged() -> a fresh render() already; no
    // further action needed here.
  }

  function cancelRenameFolder() {
    if (pendingRenameFolderPath === null) {
      return;
    }
    pendingRenameFolderPath = null;
    rerender();
  }

  function requestDeleteFolder(folderPath) {
    ContextMenu.close();
    const win = _container.ownerDocument.defaultView;
    const affectedCount = _Directory
      .getTree()
      .filter(entry => entry.path.startsWith(`${folderPath}/`)).length;
    if (!win.confirm(i18n.t('filetree.confirmDeleteFolder', { count: affectedCount }))) {
      return;
    }
    _Directory.deleteFolder(folderPath);
  }

  function startRenameFolder(folderPath) {
    pendingRenameFolderPath = folderPath;
    ContextMenu.close();
    rerender();
  }

  function startCreateAtRoot() {
    pendingCreateFolder = '';
    rerender();
  }

  function startCreateHere(folderPath) {
    openFolders.add(folderPath);
    pendingCreateFolder = folderPath;
    ContextMenu.close();
    rerender();
  }

  function startRename(id) {
    pendingRenameId = id;
    ContextMenu.close();
    rerender();
  }

  function startDrag(node) {
    draggedItem = { path: node.path, type: node.type };
  }

  function endDrag() {
    draggedItem = null;
  }

  /**
   * Whether `targetPath` ('' for the workspace root) is a valid drop
   * destination for the item currently being dragged. Moving a folder into
   * itself or one of its own descendants is invalid (Issue #206 / MEW-041
   * Lv4-2 circular-move guard); everything else is valid, including a
   * no-op drop back into the item's current folder (handled as an
   * unchanged/duplicate no-op by moveFile/moveFolder).
   * @param {string} targetPath
   * @returns {boolean}
   */
  function isValidDropTarget(targetPath) {
    if (!draggedItem) {
      return false;
    }
    if (draggedItem.type === 'folder') {
      return targetPath !== draggedItem.path && !targetPath.startsWith(`${draggedItem.path}/`);
    }
    return true;
  }

  function dropOn(targetFolderPath) {
    if (!draggedItem || !isValidDropTarget(targetFolderPath)) {
      draggedItem = null;
      return;
    }
    const { path, type } = draggedItem;
    draggedItem = null;
    const result = type === 'folder'
      ? _Directory.moveFolder(path, targetFolderPath)
      : _Directory.moveFile(path, targetFolderPath);
    if (!result.moved && result.reason === 'duplicate') {
      if (type === 'folder') {
        alertFolderUser('duplicate');
      } else {
        alertUser('duplicate');
      }
    }
    // A successful move emits Bus 'directory:changed' synchronously, which
    // triggers a fresh render() already; 'unchanged'/'circular'/'not-found'
    // are silently ignored (Issue #206 §2-4).
  }

  /**
   * Apply the current clipboard entry (set by Ctrl+X/Ctrl+C) to `targetNode`
   * on Ctrl+V (Issue #221 / MEW-041 Lv3-2). The destination folder is
   * derived the same way drag & drop resolves a drop target: a folder node
   * pastes inside itself, a file node pastes into its parent folder. A cut
   * is consumed after one paste; a copy stays on the clipboard so it can be
   * pasted repeatedly.
   * @param {{ path: string, type: 'file'|'folder' }} targetNode
   */
  function pasteClipboard(targetNode) {
    if (!_clipboard) {
      return;
    }
    const targetFolderPath = targetNode.type === 'folder'
      ? targetNode.path
      : (targetNode.path.includes('/') ? targetNode.path.slice(0, targetNode.path.lastIndexOf('/')) : '');
    const { path, type, isFolder } = _clipboard;
    if (type === 'cut') {
      _clipboard = null;
      if (isFolder) {
        _Directory.moveFolder(path, targetFolderPath);
      } else {
        _Directory.moveFile(path, targetFolderPath);
      }
    } else if (isFolder) {
      _Directory.copyFolder(path, targetFolderPath);
    } else {
      _Directory.copyFile(path, targetFolderPath);
    }
  }

  function makeCtx() {
    return {
      openFolders,
      Directory: _Directory,
      rerender,
      clipboard: _clipboard,
      showCopyIndicator: _showCopyIndicator,
      pendingCreateFolder,
      pendingRenameId,
      pendingRenameFolderPath,
      startCreateAtRoot,
      startCreateHere,
      submitCreate,
      cancelCreate,
      startRename,
      submitRename,
      cancelRename,
      requestDelete,
      startRenameFolder,
      submitRenameFolder,
      cancelRenameFolder,
      requestDeleteFolder,
      startDrag,
      endDrag,
      isValidDropTarget,
      dropOn,
      pasteClipboard,
      openFileMenu: (node, clientX, clientY) => {
        const ownerDocument = _container.ownerDocument || document;
        ContextMenu.open(clientX, clientY, ownerDocument, [
          { label: i18n.t('filetree.rename'), onSelect: () => startRename(node.id) },
          { label: i18n.t('filetree.delete'), onSelect: () => requestDelete(node.id) }
        ]);
      },
      openFolderMenu: (node, clientX, clientY) => {
        const ownerDocument = _container.ownerDocument || document;
        ContextMenu.open(clientX, clientY, ownerDocument, [
          { label: i18n.t('filetree.newFileHere'), onSelect: () => startCreateHere(node.path) },
          { label: i18n.t('filetree.renameFolder'), onSelect: () => startRenameFolder(node.path) },
          { label: i18n.t('filetree.deleteFolder'), onSelect: () => requestDeleteFolder(node.path) }
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
    if (pendingRenameId !== null || pendingRenameFolderPath !== null) {
      const input = _container.querySelector('.file-tree-rename-input');
      if (input) {
        input.focus();
        input.select();
      }
    }
  }

  function render(treeNodes) {
    ContextMenu.close();
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

  /**
   * Re-key every folder-path entry in `set` that falls under `oldPath` (the
   * folder itself or any of its descendants) onto `newPath`.
   * @param {Set<string>} set
   * @param {string} oldPath
   * @param {string} newPath
   * @returns {void}
   */
  function rekeyFolderPathSet(set, oldPath, newPath) {
    const oldPrefix = `${oldPath}/`;
    const toMigrate = [];
    set.forEach(path => {
      if (path === oldPath || path.startsWith(oldPrefix)) {
        toMigrate.push(path);
      }
    });
    toMigrate.forEach(path => {
      set.delete(path);
      set.add(path === oldPath ? newPath : newPath + path.slice(oldPath.length));
    });
  }

  /**
   * Remove every folder-path entry in `set` that falls under `folderPath`
   * (the folder itself or any of its descendants).
   * @param {Set<string>} set
   * @param {string} folderPath
   * @returns {void}
   */
  function pruneFolderPathSet(set, folderPath) {
    const prefix = `${folderPath}/`;
    const toRemove = [];
    set.forEach(path => {
      if (path === folderPath || path.startsWith(prefix)) {
        toRemove.push(path);
      }
    });
    toRemove.forEach(path => set.delete(path));
  }

  /**
   * Migrate openFolders/knownFolderPaths (expand/collapse state and the
   * "already seen" bookkeeping that gates auto-expand-on-discovery) when a
   * folder is renamed or deleted, so a renamed folder doesn't appear
   * unexpectedly collapsed or re-expanded, and doesn't collide with another
   * folder's state at the same new path (Issue #199 / MEW-041 Lv4-1 §2-3).
   * No-ops for any other directory:changed type.
   * @param {{ type?: string, oldPath?: string, newPath?: string, path?: string }} event
   */
  function migrateOpenFoldersOnDirectoryChange(event) {
    if (!event) {
      return;
    }
    if ((event.type === 'rename-folder' || event.type === 'move-folder') && event.oldPath && event.newPath) {
      rekeyFolderPathSet(openFolders, event.oldPath, event.newPath);
      rekeyFolderPathSet(knownFolderPaths, event.oldPath, event.newPath);
    } else if (event.type === 'delete-folder' && event.path) {
      pruneFolderPathSet(openFolders, event.path);
      pruneFolderPathSet(knownFolderPaths, event.path);
    }
  }

  function handleDirectoryChanged(event) {
    migrateOpenFoldersOnDirectoryChange(event);
    handleTextChanged();
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
      // Newly discovered folders start expanded; a folder already seen
      // before (via knownFolderPaths) keeps whatever expand/collapse state
      // it currently has in openFolders, rather than being forced back open
      // on every unrelated tree-structure change (Issue #199 / MEW-041
      // Lv4-1 §2-3).
      const currentFolderPaths = new Set();
      collectFolderPaths(treeNodes, currentFolderPaths);
      currentFolderPaths.forEach(path => {
        if (!knownFolderPaths.has(path)) {
          knownFolderPaths.add(path);
          openFolders.add(path);
        }
      });
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
    _Bus.on('directory:changed', handleDirectoryChanged);

    // Root drop target: any drop that isn't caught (and stopPropagation'd)
    // by a folder row bubbles here, moving the dragged item to the
    // workspace root (Issue #206 / MEW-041 Lv4-2 §2-4). Attached once here,
    // not in render(), since _container itself survives every re-render
    // (only its children are replaced via innerHTML = '').
    _container.addEventListener('dragover', event => {
      if (!isValidDropTarget('')) {
        return;
      }
      event.preventDefault();
      _container.classList.add('file-tree-drop-target');
    });
    _container.addEventListener('dragleave', () => {
      _container.classList.remove('file-tree-drop-target');
    });
    _container.addEventListener('drop', event => {
      event.preventDefault();
      _container.classList.remove('file-tree-drop-target');
      dropOn('');
    });

    handleTextChanged();
  }

  global.FileTree = {
    init,
    buildTreeStructure
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
