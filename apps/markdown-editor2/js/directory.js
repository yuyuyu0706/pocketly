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

  // True while the only registered document is the auto-seeded welcome.md
  // placeholder (from restoreOnStartup()/clearWorkspace() on an empty
  // workspace) rather than real user or imported content. importFolder()
  // uses this to replace the placeholder on its first run instead of adding
  // to it, while still adding (not replacing) on every run after that
  // (Issue #229).
  let isPlaceholderWorkspace = false;

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

  /**
   * Recompute the path of every fileRegistry entry nested under `oldPrefix`
   * to sit under `newPrefix` instead, applied atomically: if any resulting
   * path would collide with an existing (non-renamed) path, nothing is
   * changed. Shared by renameFolder() and moveFolder() (Issue #206 / MEW-041
   * Lv4-2), both of which are "rewrite everything under this folder path"
   * operations differing only in how the new prefix is derived.
   * @param {string} oldPrefix
   * @param {string} newPrefix
   * @returns {{ applied: boolean, count?: number, affectedIds?: string[], reason?: 'not-found'|'duplicate' }}
   */
  function applyBulkPathRewrite(oldPrefix, newPrefix) {
    const renames = [];
    fileRegistry.forEach((entry, id) => {
      if (entry.path.startsWith(oldPrefix)) {
        renames.push({ id, oldPath: entry.path, newPath: newPrefix + entry.path.slice(oldPrefix.length) });
      }
    });
    if (renames.length === 0) {
      return { applied: false, reason: 'not-found' };
    }

    const renamingOldPaths = new Set(renames.map(r => r.oldPath));
    const hasCollision = renames.some(r => pathIndex.has(r.newPath) && !renamingOldPaths.has(r.newPath));
    if (hasCollision) {
      return { applied: false, reason: 'duplicate' };
    }

    renames.forEach(({ oldPath }) => pathIndex.delete(oldPath));
    renames.forEach(({ id, newPath }) => {
      const entry = fileRegistry.get(id);
      entry.path = newPath;
      entry.name = newPath.split('/').pop();
      pathIndex.set(newPath, id);
      AppState.updateDocumentMeta(id, { path: newPath, name: entry.name });
    });

    return { applied: true, count: renames.length, affectedIds: renames.map(r => r.id) };
  }

  /**
   * Derive a collision-free filename for a copy operation (Issue #221 /
   * MEW-041 Lv3-2). If `baseName` doesn't collide with an existing path
   * under `targetFolderPath`, it is returned unchanged; otherwise a "-2",
   * "-3", ... suffix is inserted before the extension until a free name is
   * found (the same pattern generateNewFileName() in tabs.js uses for
   * "newfile", generalized here to any base name).
   * @param {string} baseName
   * @param {string} [targetFolderPath]
   * @returns {string}
   */
  function generateCopyName(baseName, targetFolderPath) {
    const prefix = targetFolderPath ? `${targetFolderPath}/` : '';
    if (!pathIndex.has(`${prefix}${baseName}`)) {
      return baseName;
    }
    const dotIndex = baseName.lastIndexOf('.');
    const stem = dotIndex === -1 ? baseName : baseName.slice(0, dotIndex);
    const ext = dotIndex === -1 ? '' : baseName.slice(dotIndex);
    let counter = 2;
    while (pathIndex.has(`${prefix}${stem}-${counter}${ext}`)) {
      counter += 1;
    }
    return `${stem}-${counter}${ext}`;
  }

  /**
   * Derive a collision-free folder name for a copy operation (Issue #221 /
   * MEW-041 Lv3-2), following the same "-2", "-3", ... suffix pattern as
   * generateCopyName() but checking for any existing path nested under the
   * candidate folder rather than a single file path.
   * @param {string} baseName
   * @param {string} [targetFolderPath]
   * @returns {string}
   */
  function generateCopyFolderName(baseName, targetFolderPath) {
    const prefix = targetFolderPath ? `${targetFolderPath}/` : '';
    const hasFolder = name => Array.from(pathIndex.keys()).some(p => p.startsWith(`${prefix}${name}/`));
    if (!hasFolder(baseName)) {
      return baseName;
    }
    let counter = 2;
    while (hasFolder(`${baseName}-${counter}`)) {
      counter += 1;
    }
    return `${baseName}-${counter}`;
  }

  function isExcludedPath(relativePath) {
    const segments = relativePath.split('/');
    return segments.some(seg => seg.startsWith('.') || EXCLUDED_SEGMENTS.includes(seg));
  }

  /**
   * webkitRelativePath is e.g. "my-folder/notes/a.md". The leading root folder
   * name (the folder the user selected) is kept so it appears as a top-level
   * node in the file tree (Issue #227).
   * @param {File} file
   * @returns {string}
   */
  function normalizeWebkitPath(file) {
    return file.webkitRelativePath;
  }

  /**
   * Strip the leading root segment (the selected folder name) from a path, so
   * the root itself is excluded from isExcludedPath() checks even when it
   * starts with "." (Issue #227).
   * @param {string} path
   * @returns {string}
   */
  function pathWithoutRoot(path) {
    const idx = path.indexOf('/');
    return idx === -1 ? '' : path.slice(idx + 1);
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
   * Register already-read documents ({ path, text }) into AppState without
   * clearing the previously registered set, so an "Open Folder" import can be
   * layered on top of an existing workspace instead of replacing it (Issue
   * #229). A document whose path collides with an already-registered one
   * overwrites that entry, closing the superseded AppState document (mirrors
   * importSingleFile()'s overwrite behavior).
   * @param {Array<{ path: string, text: string }>} documents
   * @returns {void}
   */
  function registerDocumentsAdditive(documents) {
    documents.forEach(({ path, text }) => {
      const name = path.split('/').pop();
      const previousId = pathIndex.get(path);
      const id = AppState.openDocument(text, { path, name, loaded: true });
      fileRegistry.set(id, { path, name, loaded: true, text });
      pathIndex.set(path, id);
      if (previousId && previousId !== id) {
        fileRegistry.delete(previousId);
        AppState.closeDocument(previousId);
      }
    });
  }

  /**
   * Register already-read assets ({ path, blob }) into assetRegistry without
   * clearing the previously registered set (Issue #229 additive counterpart
   * to registerAssets()). A colliding path simply overwrites the previous
   * Blob entry.
   * @param {Array<{ path: string, blob: Blob }>} assets
   * @returns {void}
   */
  function registerAssetsAdditive(assets) {
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
     * and node_modules. Markdown file contents are read upfront and added
     * alongside any already-imported documents (Issue #229): the previous
     * workspace is kept, not replaced. If any candidate path collides with an
     * already-registered document/asset, the user is asked via
     * window.confirm() whether to proceed (colliding entries are overwritten).
     * @param {FileList|Array<File>} fileList
     * @returns {Promise<{ imported: boolean, reason?: 'empty'|'cancelled', count?: number }>}
     */
    async importFolder(fileList) {
      const candidates = Array.from(fileList || [])
        .map(file => ({ file, path: normalizeWebkitPath(file) }))
        .filter(({ path }) => !isExcludedPath(pathWithoutRoot(path)))
        .filter(({ path }) => ALLOWED_EXTENSIONS.test(path) || ASSET_EXTENSIONS.test(path));

      if (candidates.length === 0) {
        return { imported: false, reason: 'empty' };
      }

      const collisionCount = candidates.filter(
        ({ path }) => pathIndex.has(path) || assetRegistry.has(path)
      ).length;
      if (collisionCount > 0) {
        const proceed = global.confirm(i18n.t('importFolder.confirmCollision', { count: collisionCount }));
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

      // The very first import (fresh app launch, or right after Clear
      // Workspace) finds only the auto-seeded welcome.md placeholder; drop it
      // instead of keeping it alongside the imported folder. Every import
      // after that is purely additive (Issue #229). The placeholder (and the
      // app's built-in initial document, present only before
      // restoreOnStartup() has ever run) is closed only after the imported
      // documents are registered, so AppState never transiently drops to zero
      // open documents and auto-creates a stray empty one.
      const placeholderIds = isPlaceholderWorkspace ? Array.from(fileRegistry.keys()) : [];
      if (isPlaceholderWorkspace) {
        fileRegistry.clear();
        pathIndex.clear();
        isPlaceholderWorkspace = false;
      }
      const initialActiveId = currentImportedAt === null ? AppState.getActiveDocumentId() : null;
      if (currentImportedAt === null) {
        currentImportedAt = Date.now();
      }

      // Assets must be registered before documents: registering documents makes
      // the newest document active and triggers an immediate preview render,
      // which resolves relative asset paths against assetRegistry.
      registerAssetsAdditive(assets);
      registerDocumentsAdditive(documents);
      placeholderIds.forEach(id => AppState.closeDocument(id));
      if (typeof initialActiveId === 'string') {
        AppState.closeDocument(initialActiveId);
      }

      // Unlike the old replace flow, additive registration doesn't otherwise
      // touch AppState's active document, so filetree.js (and other
      // directory:changed subscribers) would never learn the tree changed
      // without this explicit emit (Issue #229 follow-up).
      Bus.emit('directory:changed', {
        type: 'import-additive',
        affectedIds: documents.map(({ path }) => pathIndex.get(path))
      });

      await persistWorkspaceNow();
      await requestPersistentStorage();
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
        // True first launch, or a workspace that was previously cleared:
        // seed welcome.md so the file tree is never empty (Issue #210).
        const initialActiveId = AppState.getActiveDocumentId();
        Directory.createFile('welcome.md', AppState.getFallbackText());
        isPlaceholderWorkspace = true;
        if (initialActiveId) {
          AppState.closeDocument(initialActiveId);
        }
        return { restored: false, seeded: true };
      }
      currentImportedAt = workspace.importedAt;
      isPlaceholderWorkspace = false;
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
     * Register a pasted/attached image into assetRegistry under an
     * `assets/` subfolder of the active document's own folder, and schedule
     * a workspace persist, for directory-backed documents (MEW-035 Lv3-2
     * Lv4-2). Returns null when the active document set is not
     * directory-backed, so callers fall back to the legacy imageMap flow.
     *
     * Keyed relative to the active document's folder (rather than a
     * workspace-root-relative `assets/`) so resolveRelativePath() - which
     * joins the "assets/<filename>" reference against the referencing
     * document's own folder - resolves back to the same registry key
     * regardless of how deep that document sits (Issue #227: every
     * folder-imported document now sits at least one level below the
     * imported root, not just documents in subfolders).
     * @param {string} filename
     * @param {Blob} blob
     * @returns {string|null} the folder-relative asset path, or null
     */
    registerPastedAsset(filename, blob) {
      if (currentImportedAt === null) {
        return null;
      }
      const activePath = this.getActivePath();
      const baseDir = activePath && activePath.includes('/') ? activePath.slice(0, activePath.lastIndexOf('/')) : '';
      const path = baseDir ? `${baseDir}/assets/${filename}` : `assets/${filename}`;
      assetRegistry.set(path, blob);
      scheduleWorkspacePersist();
      return `assets/${filename}`;
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

      const initialActiveId = AppState.getActiveDocumentId();
      Directory.createFile('welcome.md', AppState.getFallbackText());
      isPlaceholderWorkspace = true;
      allIds.forEach(id => AppState.closeDocument(id));
      if (initialActiveId) {
        AppState.closeDocument(initialActiveId);
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
      isPlaceholderWorkspace = false;
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
      isPlaceholderWorkspace = false;
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

      const result = applyBulkPathRewrite(`${folderPath}/`, `${newFolderPath}/`);
      if (!result.applied) {
        return { renamed: false, reason: result.reason };
      }

      scheduleWorkspacePersist();
      Bus.emit('directory:changed', {
        type: 'rename-folder',
        oldPath: folderPath,
        newPath: newFolderPath,
        affectedIds: result.affectedIds
      });
      return { renamed: true, path: newFolderPath, count: result.count };
    },

    /**
     * Move a single directory-backed file into a different folder (Issue
     * #206 / MEW-041 Lv4-2 drag & drop). `targetFolderPath` is the
     * destination folder's path, or a falsy value to move the file to the
     * workspace root.
     * @param {string} sourcePath
     * @param {string} [targetFolderPath]
     * @returns {{ moved: boolean, path?: string, reason?: 'not-found'|'unchanged'|'duplicate' }}
     */
    moveFile(sourcePath, targetFolderPath) {
      const id = pathIndex.get(sourcePath);
      if (!id) {
        return { moved: false, reason: 'not-found' };
      }
      const name = sourcePath.includes('/') ? sourcePath.slice(sourcePath.lastIndexOf('/') + 1) : sourcePath;
      const newPath = targetFolderPath ? `${targetFolderPath}/${name}` : name;
      if (newPath === sourcePath) {
        return { moved: false, reason: 'unchanged' };
      }
      if (pathIndex.has(newPath)) {
        return { moved: false, reason: 'duplicate' };
      }

      const entry = fileRegistry.get(id);
      pathIndex.delete(sourcePath);
      entry.path = newPath;
      entry.name = name;
      pathIndex.set(newPath, id);
      AppState.updateDocumentMeta(id, { path: newPath, name });

      scheduleWorkspacePersist();
      Bus.emit('directory:changed', { type: 'move-file', oldPath: sourcePath, newPath, affectedIds: [id] });
      return { moved: true, path: newPath };
    },

    /**
     * Move a folder (and everything nested under it) into a different
     * parent folder (Issue #206 / MEW-041 Lv4-2 drag & drop). Moving a
     * folder into itself or into one of its own descendants is silently
     * ignored (no error, no change) to avoid an unrepresentable circular
     * path. `targetFolderPath` is the destination folder's path, or a
     * falsy value to move the folder to the workspace root.
     * @param {string} sourcePath
     * @param {string} [targetFolderPath]
     * @returns {{ moved: boolean, path?: string, count?: number, reason?: 'circular'|'unchanged'|'not-found'|'duplicate' }}
     */
    moveFolder(sourcePath, targetFolderPath) {
      if (targetFolderPath === sourcePath || (targetFolderPath && targetFolderPath.startsWith(`${sourcePath}/`))) {
        return { moved: false, reason: 'circular' };
      }
      const name = sourcePath.includes('/') ? sourcePath.slice(sourcePath.lastIndexOf('/') + 1) : sourcePath;
      const newPath = targetFolderPath ? `${targetFolderPath}/${name}` : name;
      if (newPath === sourcePath) {
        return { moved: false, reason: 'unchanged' };
      }

      const result = applyBulkPathRewrite(`${sourcePath}/`, `${newPath}/`);
      if (!result.applied) {
        return { moved: false, reason: result.reason };
      }

      scheduleWorkspacePersist();
      Bus.emit('directory:changed', {
        type: 'move-folder',
        oldPath: sourcePath,
        newPath,
        affectedIds: result.affectedIds
      });
      return { moved: true, path: newPath, count: result.count };
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
     * Copy a single directory-backed file into a (possibly different)
     * folder (Issue #221 / MEW-041 Lv3-2 Ctrl+C/Ctrl+V), leaving the source
     * file untouched. Unlike moveFile(), a naming collision is resolved
     * automatically via generateCopyName() rather than rejected.
     * @param {string} sourcePath
     * @param {string} [targetFolderPath]
     * @returns {{ copied: boolean, id?: string, path?: string, reason?: 'not-found' }}
     */
    copyFile(sourcePath, targetFolderPath) {
      const id = pathIndex.get(sourcePath);
      if (!id) {
        return { copied: false, reason: 'not-found' };
      }
      const entry = fileRegistry.get(id);
      const baseName = sourcePath.includes('/') ? sourcePath.slice(sourcePath.lastIndexOf('/') + 1) : sourcePath;
      const newName = generateCopyName(baseName, targetFolderPath);
      const newPath = targetFolderPath ? `${targetFolderPath}/${newName}` : newName;

      const newId = AppState.openDocument(entry.text, { path: newPath, name: newName });
      fileRegistry.set(newId, { path: newPath, name: newName, loaded: true, text: entry.text });
      pathIndex.set(newPath, newId);

      scheduleWorkspacePersist();
      Bus.emit('directory:changed', { type: 'copy-file', id: newId, path: newPath });
      return { copied: true, id: newId, path: newPath };
    },

    /**
     * Copy a folder (and everything nested under it) into a (possibly
     * different) parent folder (Issue #221 / MEW-041 Lv3-2 Ctrl+C/Ctrl+V),
     * leaving the source folder untouched. Copying a folder into itself or
     * one of its own descendants is silently ignored (no error, no change),
     * mirroring moveFolder()'s circular-move guard. Naming collisions for
     * the copied folder itself are resolved via generateCopyFolderName().
     * @param {string} sourcePath
     * @param {string} [targetFolderPath]
     * @returns {{ copied: boolean, path?: string, count?: number, reason?: 'circular'|'not-found' }}
     */
    copyFolder(sourcePath, targetFolderPath) {
      if (targetFolderPath === sourcePath || (targetFolderPath && targetFolderPath.startsWith(`${sourcePath}/`))) {
        return { copied: false, reason: 'circular' };
      }
      const prefix = `${sourcePath}/`;
      const filesToCopy = [];
      fileRegistry.forEach((entry) => {
        if (entry.path.startsWith(prefix)) {
          filesToCopy.push({ path: entry.path, text: entry.text });
        }
      });
      if (filesToCopy.length === 0) {
        return { copied: false, reason: 'not-found' };
      }

      const folderName = sourcePath.includes('/') ? sourcePath.slice(sourcePath.lastIndexOf('/') + 1) : sourcePath;
      const newFolderName = generateCopyFolderName(folderName, targetFolderPath);
      const newFolderPath = targetFolderPath ? `${targetFolderPath}/${newFolderName}` : newFolderName;
      const newPrefix = `${newFolderPath}/`;

      const newIds = [];
      filesToCopy.forEach(({ path, text }) => {
        const suffix = path.slice(prefix.length);
        const newPath = newPrefix + suffix;
        const newName = newPath.split('/').pop();
        const newId = AppState.openDocument(text, { path: newPath, name: newName });
        fileRegistry.set(newId, { path: newPath, name: newName, loaded: true, text });
        pathIndex.set(newPath, newId);
        newIds.push(newId);
      });

      scheduleWorkspacePersist();
      Bus.emit('directory:changed', {
        type: 'copy-folder', oldPath: sourcePath, newPath: newFolderPath, affectedIds: newIds
      });
      return { copied: true, path: newFolderPath, count: newIds.length };
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
