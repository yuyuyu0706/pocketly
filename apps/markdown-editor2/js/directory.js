(function (global) {
  'use strict';

  const ALLOWED_EXTENSIONS = /\.(md|markdown)$/i;
  const ASSET_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg)$/i;
  const EXCLUDED_SEGMENTS = ['node_modules'];

  const DB_NAME = 'mew-workspace-store';
  const DB_VERSION = 1;
  const STORE_NAME = 'workspaces';
  const WORKSPACE_KEY = 'default';

  // Maps AppState document ids to their originating path/load state.
  // Kept private to this module; consumed via getTree()/getActivePath() rather
  // than reaching into this Map directly.
  const fileRegistry = new Map();

  // path -> id, for resolving relative document links without scanning fileRegistry.
  const pathIndex = new Map();

  // path -> Blob, for resolving relative image references (MEW-035 Lv3-2 Lv4-1).
  const assetRegistry = new Map();

  // importedAt of the currently loaded workspace, or null when the active
  // document set is not directory-backed. Cached at the module scope so
  // scheduleWorkspacePersist() doesn't need to re-derive it on every call
  // (MEW-035 Lv3-2 Lv4-2).
  let currentImportedAt = null;

  const DOCUMENTS_SAVE_DEBOUNCE = 300; // Matches state.js's DOCUMENTS_SAVE_DEBOUNCE.
  let saveTimer = null;

  // Injected via Directory.init(); triggers a browser download for a Blob.
  // Shared with Export (script.js) rather than re-implemented here.
  let _triggerDownloadFromBlob = null;

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  /**
   * "YYYYMMDD-HHMMSS" timestamp (local time) for the export zip filename.
   * @returns {string}
   */
  function dateStamp() {
    const d = new Date();
    return (
      `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
      `-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
    );
  }

  /**
   * Generate a collision-free "Untitled[-n].md" path for a document that has
   * no fileRegistry-tracked path (i.e. the active document when it isn't
   * directory-backed), avoiding any path already claimed within usedPaths.
   * @param {Set<string>} usedPaths
   * @returns {string}
   */
  function generateFallbackPath(usedPaths) {
    let candidate = 'Untitled.md';
    let n = 2;
    while (usedPaths.has(candidate)) {
      candidate = `Untitled-${n}.md`;
      n += 1;
    }
    return candidate;
  }

  /**
   * Debounce a saveWorkspace() call reconstructed from the current
   * fileRegistry/assetRegistry contents. No-ops when the active document set
   * is not directory-backed (currentImportedAt === null).
   * @returns {void}
   */
  function scheduleWorkspacePersist() {
    if (typeof global.setTimeout !== 'function') {
      persistWorkspaceNow();
      return;
    }
    global.clearTimeout(saveTimer);
    saveTimer = global.setTimeout(() => {
      saveTimer = null;
      persistWorkspaceNow();
    }, DOCUMENTS_SAVE_DEBOUNCE);
  }

  function persistWorkspaceNow() {
    if (currentImportedAt === null) {
      return;
    }
    const documents = Array.from(fileRegistry.values()).map(({ path, text }) => ({ path, text }));
    const assets = Array.from(assetRegistry.entries()).map(([path, blob]) => ({ path, blob }));
    saveWorkspace({ documents, assets, importedAt: currentImportedAt });
  }

  /**
   * Flush a pending debounced workspace persist immediately, synchronously
   * scheduling the IndexedDB write. Intended for beforeunload/pagehide,
   * mirroring state.js's flushPendingDocumentsPersist() pattern.
   * @returns {void}
   */
  function flushPendingWorkspacePersist() {
    if (!saveTimer) {
      return;
    }
    global.clearTimeout(saveTimer);
    saveTimer = null;
    persistWorkspaceNow();
  }

  function isIndexedDbSupported() {
    return typeof global.indexedDB !== 'undefined' && global.indexedDB !== null;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE_NAME)) {
          req.result.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Persist the imported workspace ({ documents, assets, importedAt }) as the
   * single stored workspace. No-ops (resolves without throwing) when
   * IndexedDB is unavailable, or the save itself fails; this is a
   * best-effort cache, not something importFolder() should fail over.
   * @param {{ documents: Array<{path:string,text:string}>, assets: Array<{path:string,blob:Blob}>, importedAt: number }} workspace
   * @returns {Promise<void>}
   */
  async function saveWorkspace(workspace) {
    if (!isIndexedDbSupported()) {
      return;
    }
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(workspace, WORKSPACE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch (error) {
      console.warn('[Directory] Failed to save workspace.', error);
    }
  }

  /**
   * Load the previously saved workspace, or null if none exists / IndexedDB
   * is unavailable / the read fails.
   * @returns {Promise<{ documents: Array<{path:string,text:string}>, assets?: Array<{path:string,blob:Blob}>, importedAt: number }|null>}
   */
  async function loadWorkspace() {
    if (!isIndexedDbSupported()) {
      return null;
    }
    try {
      const db = await openDb();
      const workspace = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(WORKSPACE_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return workspace;
    } catch (error) {
      console.warn('[Directory] Failed to load workspace.', error);
      return null;
    }
  }

  /**
   * Best-effort request for persistent storage so the browser is less likely
   * to evict the IndexedDB workspace under storage pressure. Never throws.
   * @returns {Promise<void>}
   */
  async function requestPersistentStorage() {
    try {
      if (global.navigator && global.navigator.storage && typeof global.navigator.storage.persist === 'function') {
        await global.navigator.storage.persist();
      }
    } catch (error) {
      console.warn('[Directory] Failed to request persistent storage.', error);
    }
  }

  /**
   * Normalize a new file's filename segment (no folder separators): trims
   * whitespace, auto-appends ".md" when no extension is present, and rejects
   * anything whose extension isn't in ALLOWED_EXTENSIONS. Returns null for
   * empty, "/"-containing, or extension-invalid input; callers decide the
   * reason to report.
   * @param {string} name
   * @returns {string|null}
   */
  function normalizeNewFilename(name) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed || trimmed.includes('/')) {
      return null;
    }
    if (!trimmed.includes('.')) {
      return `${trimmed}.md`;
    }
    return ALLOWED_EXTENSIONS.test(trimmed) ? trimmed : null;
  }

  /**
   * Normalize a new file's full path (may include "/" folder segments): only
   * the final filename segment is validated/normalized via
   * normalizeNewFilename(); folder segments are left untouched. Returns null
   * for empty or extension-invalid input.
   * @param {string} path
   * @returns {string|null}
   */
  function normalizeNewFilePath(path) {
    const trimmed = typeof path === 'string' ? path.trim() : '';
    if (!trimmed) {
      return null;
    }
    const lastSlash = trimmed.lastIndexOf('/');
    const folderPrefix = lastSlash === -1 ? '' : trimmed.slice(0, lastSlash + 1);
    const filename = lastSlash === -1 ? trimmed : trimmed.slice(lastSlash + 1);
    const normalizedName = normalizeNewFilename(filename);
    if (!normalizedName) {
      return null;
    }
    return `${folderPrefix}${normalizedName}`;
  }

  /**
   * Normalize a folder's new name segment (no folder separators): trims
   * whitespace and rejects empty input or input containing "/". Unlike
   * normalizeNewFilename(), no extension handling applies to folder names.
   * @param {string} name
   * @returns {string|null}
   */
  function normalizeFolderName(name) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed || trimmed.includes('/')) {
      return null;
    }
    return trimmed;
  }

  function isExcludedPath(relativePath) {
    const segments = relativePath.split('/');
    return segments.some(seg => seg.startsWith('.') || EXCLUDED_SEGMENTS.includes(seg));
  }

  /**
   * webkitRelativePath is e.g. "my-folder/notes/a.md"; strip the leading root
   * folder name so paths are folder-relative like the previous handle-based flow.
   * @param {File} file
   * @returns {string}
   */
  function normalizeWebkitPath(file) {
    const parts = file.webkitRelativePath.split('/');
    return parts.slice(1).join('/');
  }

  /**
   * Join a relative reference against the directory of fromPath, then collapse
   * "." / ".." segments. Returns null if the reference escapes the folder root.
   * @param {string} fromPath
   * @param {string} ref
   * @returns {string|null}
   */
  function normalizeRelativePath(fromPath, ref) {
    const baseDir = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/')) : '';
    const combined = baseDir ? `${baseDir}/${ref}` : ref;
    const stack = [];
    for (const segment of combined.split('/')) {
      if (segment === '' || segment === '.') {
        continue;
      }
      if (segment === '..') {
        if (stack.length === 0) {
          return null;
        }
        stack.pop();
        continue;
      }
      stack.push(segment);
    }
    return stack.join('/');
  }

  // --- Import progress UI --------------------------------------------------
  // No pre-existing progress/loading indicator pattern elsewhere in the app,
  // so a minimal DOM-based indicator is created/torn down here.

  let progressEl = null;

  function showImportProgress(count) {
    hideImportProgress();
    const doc = global.document;
    if (!doc || !doc.body) {
      return;
    }
    progressEl = doc.createElement('div');
    progressEl.id = 'import-folder-progress';
    progressEl.setAttribute('role', 'status');
    progressEl.setAttribute('aria-live', 'polite');
    progressEl.textContent = `0 / ${count}`;
    doc.body.appendChild(progressEl);
  }

  function updateImportProgress(processed, total) {
    if (progressEl) {
      progressEl.textContent = `${processed} / ${total}`;
    }
  }

  function hideImportProgress() {
    if (progressEl && progressEl.parentNode) {
      progressEl.parentNode.removeChild(progressEl);
    }
    progressEl = null;
  }

  /**
   * Register already-read documents ({ path, text }) into AppState, closing
   * the app's currently-active document once the new ones are in place.
   * Shared by importFolder() and restoreOnStartup().
   * @param {Array<{ path: string, text: string }>} documents
   * @returns {void}
   */
  function registerDocuments(documents) {
    const initialActiveId = AppState.getActiveDocumentId();

    // Re-import (importFolder called again after a workspace already exists)
    // replaces the previously registered documents rather than layering new
    // ones on top of them; close whatever this module previously registered
    // before adding the freshly imported/restored set.
    const previousIds = Array.from(fileRegistry.keys());
    fileRegistry.clear();
    pathIndex.clear();

    documents.forEach(({ path, text }) => {
      const name = path.split('/').pop();
      const id = AppState.openDocument(text, { path, name, loaded: true });
      fileRegistry.set(id, { path, name, loaded: true, text });
      pathIndex.set(path, id);
    });

    // MEW-002 has no API for replacing the app's launch document in place, so the
    // initial document is closed once the imported documents are registered;
    // AppState.closeDocument() falls back to one of the newly-opened documents
    // (or a fresh empty one if the import had no .md files).
    if (typeof initialActiveId === 'string') {
      AppState.closeDocument(initialActiveId);
    }
    previousIds.forEach(id => AppState.closeDocument(id));
  }

  /**
   * Register already-read assets ({ path, blob }) into assetRegistry, clearing
   * whatever was previously registered so a re-import doesn't leave stale
   * entries from the previous folder behind. Shared by importFolder() and
   * restoreOnStartup(), called in tandem with registerDocuments().
   * @param {Array<{ path: string, blob: Blob }>} assets
   * @returns {void}
   */
  function registerAssets(assets) {
    assetRegistry.clear();
    (assets || []).forEach(({ path, blob }) => {
      assetRegistry.set(path, blob);
    });
  }

  /**
   * Global directory/file-tree manager for the folder-import flow
   * (`<input type="file" webkitdirectory>` based; see Issue #171 / MEW-035 Lv4-2).
   */
  const Directory = {
    /**
     * Inject shared dependencies. Currently only triggerDownloadFromBlob,
     * reused from script.js rather than re-implemented here (Issue #183).
     * @param {{ triggerDownloadFromBlob: (blob: Blob, filename: string) => void }} deps
     * @returns {void}
     */
    init({ triggerDownloadFromBlob } = {}) {
      if (typeof triggerDownloadFromBlob === 'function') {
        _triggerDownloadFromBlob = triggerDownloadFromBlob;
      }
    },

    /**
     * Import a FileList selected via the webkitdirectory input. Filters to the
     * allow-list (.md/.markdown + image extensions), excluding hidden segments
     * and node_modules. Markdown file contents are read upfront and persisted
     * to IndexedDB; if a workspace is already stored, the user is asked via
     * window.confirm() whether to replace it.
     * @param {FileList|Array<File>} fileList
     * @returns {Promise<{ imported: boolean, reason?: 'empty'|'cancelled', count?: number }>}
     */
    async importFolder(fileList) {
      const candidates = Array.from(fileList || [])
        .map(file => ({ file, path: normalizeWebkitPath(file) }))
        .filter(({ path }) => !isExcludedPath(path))
        .filter(({ path }) => ALLOWED_EXTENSIONS.test(path) || ASSET_EXTENSIONS.test(path));

      if (candidates.length === 0) {
        return { imported: false, reason: 'empty' };
      }

      const existing = await loadWorkspace();
      if (existing) {
        const proceed = global.confirm(
          i18n.t('importFolder.confirmReplace', { date: new Date(existing.importedAt).toLocaleString() })
        );
        if (!proceed) {
          return { imported: false, reason: 'cancelled' };
        }
      }

      showImportProgress(candidates.length);
      const documents = [];
      const assets = [];
      let processed = 0;
      for (const { file, path } of candidates) {
        if (ALLOWED_EXTENSIONS.test(path)) {
          documents.push({ path, text: await file.text() });
        } else if (ASSET_EXTENSIONS.test(path)) {
          // File is a Blob subclass, so it can be stored as-is.
          assets.push({ path, blob: file });
        }
        processed += 1;
        updateImportProgress(processed, candidates.length);
      }

      const importedAt = Date.now();
      await saveWorkspace({ documents, assets, importedAt });
      await requestPersistentStorage();

      currentImportedAt = importedAt;

      // Assets must be registered before documents: registering documents makes
      // the (only remaining) document active and triggers an immediate preview
      // render, which resolves relative asset paths against assetRegistry.
      registerAssets(assets);
      registerDocuments(documents);
      hideImportProgress();

      return { imported: true, count: documents.length };
    },

    /**
     * Load a previously imported workspace from IndexedDB (if any) and
     * register its documents into AppState. Intended to be called once at
     * startup, after AppState.init().
     * @returns {Promise<{ restored: boolean, count?: number }>}
     */
    async restoreOnStartup() {
      const workspace = await loadWorkspace();
      if (
        !workspace ||
        !Array.isArray(workspace.documents) ||
        workspace.documents.length === 0
      ) {
        return { restored: false };
      }
      currentImportedAt = workspace.importedAt;
      registerAssets(workspace.assets || []);
      registerDocuments(workspace.documents);
      return { restored: true, count: workspace.documents.length };
    },

    /**
     * Switch to the given document. Text is already loaded into AppState at
     * import/restore time, so this is normally a thin wrapper.
     *
     * Exception (Issue #181 / MEW-012 Lv2-8): a document closed via its tab
     * (Tabs.closeTab -> AppState.closeDocument) is removed from AppState
     * entirely, but its cached text/path stays in fileRegistry (added for
     * Lv4-2). If the caller re-activates that id (e.g. re-clicking the same
     * file in the tree) and AppState no longer knows about it, re-open the
     * cached entry as a fresh document, re-key fileRegistry/pathIndex to the
     * new id, then switch to it.
     * @param {string} id
     * @returns {void}
     */
    activateDocument(id) {
      if (AppState.listDocuments().some(doc => doc.id === id)) {
        AppState.switchActiveDocument(id);
        return;
      }

      const entry = fileRegistry.get(id);
      if (!entry) {
        return;
      }

      const newId = AppState.openDocument(entry.text, { path: entry.path, name: entry.name });
      fileRegistry.delete(id);
      fileRegistry.set(newId, entry);
      pathIndex.set(entry.path, newId);
      AppState.switchActiveDocument(newId);
    },

    /**
     * List all directory-backed documents currently tracked.
     * @returns {Array<{ id: string, path: string, loaded: boolean }>}
     */
    getTree() {
      return Array.from(fileRegistry.entries()).map(([id, entry]) => ({
        id,
        path: entry.path,
        loaded: entry.loaded
      }));
    },

    /**
     * List all directory-backed documents with their cached text, for
     * cross-document search (Issue #193 / MEW-014). Unlike getTree(), this
     * includes `text` so callers don't need to activate each document to
     * read its content.
     * @returns {Array<{ id: string, path: string, text: string }>}
     */
    getSearchableDocuments() {
      return Array.from(fileRegistry.entries()).map(([id, entry]) => ({
        id,
        path: entry.path,
        text: entry.text
      }));
    },

    /**
     * Folder-relative path of the currently active document, or null if the
     * active document is not directory-backed (or none imported/restored).
     * @returns {string|null}
     */
    getActivePath() {
      const id = AppState.getActiveDocumentId();
      if (typeof id !== 'string') {
        return null;
      }
      const entry = fileRegistry.get(id);
      return entry ? entry.path : null;
    },

    /**
     * Resolve a Markdown-relative reference (image src / link href) against the
     * folder path of the document it appears in. Document-to-document links
     * are resolved via pathIndex; image/asset references are resolved via
     * assetRegistry (MEW-035 Lv3-2 Lv4-1).
     * @param {string} fromPath folder-relative path of the referencing document
     * @param {string} ref relative reference from the Markdown (e.g. "../images/pic.png")
     * @returns {Promise<{ type: 'document', id: string, path: string }|{ type: 'asset', path: string, blob: Blob }|null>}
     */
    async resolveRelativePath(fromPath, ref) {
      if (typeof fromPath !== 'string' || typeof ref !== 'string' || !ref) {
        return null;
      }
      const normalizedPath = normalizeRelativePath(fromPath, ref);
      if (!normalizedPath) {
        return null;
      }
      const docId = pathIndex.get(normalizedPath);
      if (docId) {
        return { type: 'document', id: docId, path: normalizedPath };
      }
      const blob = assetRegistry.get(normalizedPath);
      if (!blob) {
        return null;
      }
      return { type: 'asset', path: normalizedPath, blob };
    },

    /**
     * Register a pasted/attached image into assetRegistry under `assets/`
     * and schedule a workspace persist, for directory-backed documents
     * (MEW-035 Lv3-2 Lv4-2). Returns null when the active document set is
     * not directory-backed, so callers fall back to the legacy imageMap
     * flow.
     * @param {string} filename
     * @param {Blob} blob
     * @returns {string|null} the folder-relative asset path, or null
     */
    registerPastedAsset(filename, blob) {
      if (currentImportedAt === null) {
        return null;
      }
      const path = `assets/${filename}`;
      assetRegistry.set(path, blob);
      scheduleWorkspacePersist();
      return path;
    },

    /**
     * Reset the workspace (IndexedDB + fileRegistry/pathIndex/assetRegistry)
     * to its initial empty state, then restore the app to a single Welcome-text
     * document (MEW-039). Destructive; callers must confirm with the user first.
     * @returns {Promise<{ cleared: boolean }>}
     */
    async clearWorkspace() {
      const allIds = Array.from(fileRegistry.keys());
      fileRegistry.clear();
      assetRegistry.clear();
      pathIndex.clear();
      currentImportedAt = null;
      await saveWorkspace({ documents: [], assets: [], importedAt: null });
      allIds.forEach(id => AppState.closeDocument(id));

      const activeId = AppState.getActiveDocumentId();
      if (activeId) {
        AppState.setText(AppState.getFallbackText(), 'init');
      }
      return { cleared: true };
    },

    /**
     * Register a single file opened via "Open File" into fileRegistry
     * alongside any existing folder-imported documents (additive; does not
     * clear the existing workspace). Same-name files overwrite the previous
     * entry, matching registerPastedAsset()'s overwrite behavior (MEW-039).
     * @param {File} file
     * @returns {Promise<{ imported: boolean, id: string }>}
     */
    async importSingleFile(file) {
      const path = file.name;
      const text = await file.text();
      const previousId = pathIndex.get(path);
      const id = AppState.openDocument(text, { path, name: file.name });
      fileRegistry.set(id, { path, name: file.name, loaded: true, text });
      pathIndex.set(path, id);
      AppState.switchActiveDocument(id);
      if (previousId && previousId !== id) {
        fileRegistry.delete(previousId);
        AppState.closeDocument(previousId);
      }
      if (currentImportedAt === null) {
        currentImportedAt = Date.now();
      }
      scheduleWorkspacePersist();
      return { imported: true, id };
    },

    /**
     * Create a new empty (or seeded) file at the given folder-relative path
     * (Issue #196 / MEW-011 Lv3-1). If `path` has no extension, ".md" is
     * appended; an explicit extension outside ALLOWED_EXTENSIONS is rejected.
     * Path may contain "/" segments to implicitly create nested folders (the
     * tree in filetree.js already builds folders from paths).
     * @param {string} path
     * @param {string} [initialText='']
     * @returns {{ created: boolean, id?: string, path?: string, reason?: 'invalid-extension'|'duplicate' }}
     */
    createFile(path, initialText = '') {
      const normalizedPath = normalizeNewFilePath(path);
      if (!normalizedPath) {
        return { created: false, reason: 'invalid-extension' };
      }
      if (pathIndex.has(normalizedPath)) {
        return { created: false, reason: 'duplicate' };
      }
      const name = normalizedPath.split('/').pop();
      const text = typeof initialText === 'string' ? initialText : '';
      const id = AppState.openDocument(text, { path: normalizedPath, name });
      fileRegistry.set(id, { path: normalizedPath, name, loaded: true, text });
      pathIndex.set(normalizedPath, id);
      if (currentImportedAt === null) {
        currentImportedAt = Date.now();
      }
      scheduleWorkspacePersist();
      Bus.emit('directory:changed', { type: 'create', id, path: normalizedPath });
      return { created: true, id, path: normalizedPath };
    },

    /**
     * Delete a directory-backed file by id (Issue #196 / MEW-011 Lv3-1).
     * Closes it in AppState, letting the existing active-document fallback
     * logic handle the tab transition if it was active.
     * @param {string} id
     * @returns {{ deleted: boolean }}
     */
    deleteFile(id) {
      const entry = fileRegistry.get(id);
      if (!entry) {
        return { deleted: false };
      }
      fileRegistry.delete(id);
      pathIndex.delete(entry.path);
      AppState.closeDocument(id);
      scheduleWorkspacePersist();
      Bus.emit('directory:changed', { type: 'delete', id });
      return { deleted: true };
    },

    /**
     * Rename a directory-backed file's filename, preserving its folder
     * (Issue #196 / MEW-011 Lv3-1). `newFilename` is just the filename, not a
     * path; the folder portion of the existing path cannot be changed here.
     * @param {string} id
     * @param {string} newFilename
     * @returns {{ renamed: boolean, path?: string, reason?: 'invalid-extension'|'invalid-name'|'duplicate'|'not-found' }}
     */
    renameFile(id, newFilename) {
      const entry = fileRegistry.get(id);
      if (!entry) {
        return { renamed: false, reason: 'not-found' };
      }
      const trimmedName = typeof newFilename === 'string' ? newFilename.trim() : '';
      const normalizedName = normalizeNewFilename(newFilename);
      if (!normalizedName) {
        return { renamed: false, reason: trimmedName.includes('/') ? 'invalid-name' : 'invalid-extension' };
      }
      const lastSlash = entry.path.lastIndexOf('/');
      const folderPrefix = lastSlash === -1 ? '' : entry.path.slice(0, lastSlash + 1);
      const newPath = `${folderPrefix}${normalizedName}`;
      if (newPath !== entry.path && pathIndex.has(newPath)) {
        return { renamed: false, reason: 'duplicate' };
      }
      pathIndex.delete(entry.path);
      pathIndex.set(newPath, id);
      entry.path = newPath;
      entry.name = normalizedName;
      AppState.updateDocumentMeta(id, { path: newPath, name: normalizedName });
      scheduleWorkspacePersist();
      Bus.emit('directory:changed', { type: 'rename', id, path: newPath });
      return { renamed: true, path: newPath };
    },

    /**
     * Rename a folder, updating the folder-relative path of all files nested
     * under it (Issue #199 / MEW-041 Lv4-1). Only the folder's final path
     * segment may change; `newFolderName` is a plain name, not a path. The
     * rename is applied as a single atomic operation: if any nested file's
     * new path would collide with an existing path (that isn't itself being
     * renamed), the whole operation is aborted and nothing changes.
     * @param {string} folderPath
     * @param {string} newFolderName
     * @returns {{ renamed: boolean, path?: string, count?: number, reason?: 'invalid-name'|'unchanged'|'not-found'|'duplicate' }}
     */
    renameFolder(folderPath, newFolderName) {
      const normalizedName = normalizeFolderName(newFolderName);
      if (!normalizedName) {
        return { renamed: false, reason: 'invalid-name' };
      }

      const parentPrefix = folderPath.includes('/')
        ? folderPath.slice(0, folderPath.lastIndexOf('/') + 1)
        : '';
      const newFolderPath = `${parentPrefix}${normalizedName}`;
      if (newFolderPath === folderPath) {
        return { renamed: false, reason: 'unchanged' };
      }

      const oldPrefix = `${folderPath}/`;
      const newPrefix = `${newFolderPath}/`;
      const renames = [];
      fileRegistry.forEach((entry, id) => {
        if (entry.path.startsWith(oldPrefix)) {
          renames.push({ id, oldPath: entry.path, newPath: newPrefix + entry.path.slice(oldPrefix.length) });
        }
      });
      if (renames.length === 0) {
        return { renamed: false, reason: 'not-found' };
      }

      const renamingOldPaths = new Set(renames.map(r => r.oldPath));
      const hasCollision = renames.some(r => pathIndex.has(r.newPath) && !renamingOldPaths.has(r.newPath));
      if (hasCollision) {
        return { renamed: false, reason: 'duplicate' };
      }

      renames.forEach(({ oldPath }) => pathIndex.delete(oldPath));
      renames.forEach(({ id, newPath }) => {
        const entry = fileRegistry.get(id);
        entry.path = newPath;
        entry.name = newPath.split('/').pop();
        pathIndex.set(newPath, id);
        AppState.updateDocumentMeta(id, { path: newPath, name: entry.name });
      });

      scheduleWorkspacePersist();
      Bus.emit('directory:changed', {
        type: 'rename-folder',
        oldPath: folderPath,
        newPath: newFolderPath,
        affectedIds: renames.map(r => r.id)
      });
      return { renamed: true, path: newFolderPath, count: renames.length };
    },

    /**
     * Delete a folder and every file nested under it (Issue #199 / MEW-041
     * Lv4-1). Each affected file is closed in AppState the same way
     * deleteFile() closes a single file, letting the existing active-document
     * fallback logic handle any tab transitions.
     * @param {string} folderPath
     * @returns {{ deleted: boolean, count?: number, reason?: 'not-found' }}
     */
    deleteFolder(folderPath) {
      const prefix = `${folderPath}/`;
      const affectedIds = [];
      fileRegistry.forEach((entry, id) => {
        if (entry.path.startsWith(prefix)) {
          affectedIds.push(id);
        }
      });
      if (affectedIds.length === 0) {
        return { deleted: false, reason: 'not-found' };
      }

      affectedIds.forEach(id => {
        const entry = fileRegistry.get(id);
        fileRegistry.delete(id);
        pathIndex.delete(entry.path);
        AppState.closeDocument(id);
      });
      scheduleWorkspacePersist();
      Bus.emit('directory:changed', { type: 'delete-folder', path: folderPath, affectedIds });
      return { deleted: true, count: affectedIds.length };
    },

    /**
     * Export all currently open documents (Issue #183 / MEW-040) as a zip:
     * fileRegistry-tracked (folder-imported/single-file-opened) documents by
     * their tracked path/text, plus the active document even when it isn't
     * fileRegistry-tracked (e.g. the initial Welcome document) so a workspace
     * that was never folder-imported doesn't export empty. Any other
     * non-tracked, non-active document is skipped: AppState has no API to
     * read the text of a document that is neither active nor cached here
     * (confirmed design decision, see workspace-03-issue-catalog.md MEW-040).
     * Registered assets (assetRegistry) are always included.
     * @returns {Promise<void>}
     */
    async exportWorkspaceAsZip() {
      const { strToU8, zipSync } = global.fflate;
      const activeId = AppState.getActiveDocumentId();
      const docs = AppState.listDocuments();
      const files = {};
      const usedPaths = new Set();

      docs.forEach(doc => {
        const entry = fileRegistry.get(doc.id);
        if (!entry && doc.id !== activeId) {
          return;
        }
        const text = entry ? entry.text : AppState.getText();
        const path = entry ? entry.path : generateFallbackPath(usedPaths);
        usedPaths.add(path);
        files[path] = strToU8(text);
      });

      for (const [path, blob] of assetRegistry) {
        files[path] = new Uint8Array(await blob.arrayBuffer());
      }

      const zipped = zipSync(files);
      const blob = new Blob([zipped], { type: 'application/zip' });
      const filename = `workspace-export-${dateStamp()}.zip`;
      if (typeof _triggerDownloadFromBlob === 'function') {
        _triggerDownloadFromBlob(blob, filename);
      }
    }
  };

  if (global.Bus && typeof global.Bus.on === 'function') {
    global.Bus.on('text:changed', ({ text } = {}) => {
      if (typeof text !== 'string') {
        return;
      }
      const activeId = AppState.getActiveDocumentId();
      const entry = fileRegistry.get(activeId);
      if (!entry) {
        return; // Not a directory-backed document.
      }
      entry.text = text;
      scheduleWorkspacePersist();
    });
  }

  if (typeof global.addEventListener === 'function') {
    const persistOnUnload = () => flushPendingWorkspacePersist();
    global.addEventListener('beforeunload', persistOnUnload, { capture: true });
    global.addEventListener('pagehide', persistOnUnload, { capture: true });
  }

  // Expose internals for unit testing via window.__directoryTest
  global.__directoryTest = {
    getRegistrySize: () => fileRegistry.size,
    getAssetRegistrySize: () => assetRegistry.size
  };

  global.Directory = Directory;
})(window);
