(function (global) {
  'use strict';

  const MARKDOWN_EXTENSION = /\.md$/i;

  // Maps AppState document ids to their originating file handle/path/load state.
  // Kept private to this module; Lv3-2 (relative path resolution) will consume it
  // via getTree()/a future accessor rather than reaching into this Map directly.
  const fileRegistry = new Map();

  // path -> id, for resolving relative document links (Lv3-2) without scanning fileRegistry.
  const pathIndex = new Map();

  // Root handle of the currently open folder, used to resolve relative asset paths
  // (images etc.) that are not registered as documents in fileRegistry.
  let rootDirHandle = null;

  function isHiddenName(name) {
    return typeof name === 'string' && name.startsWith('.');
  }

  function isMarkdownFile(name) {
    return typeof name === 'string' && MARKDOWN_EXTENSION.test(name) && !isHiddenName(name);
  }

  /**
   * Recursively walk a directory handle, collecting `.md` file handles.
   * Hidden entries (dotfiles/dot-directories) and non-.md files are excluded.
   * @param {FileSystemDirectoryHandle} dirHandle
   * @param {string} basePath
   * @param {Array<{ handle: FileSystemFileHandle, path: string, name: string }>} out
   * @returns {Promise<void>}
   */
  async function collectMarkdownFiles(dirHandle, basePath, out) {
    for await (const entry of dirHandle.values()) {
      if (isHiddenName(entry.name)) {
        continue;
      }
      const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;
      if (entry.kind === 'directory') {
        await collectMarkdownFiles(entry, entryPath, out);
      } else if (entry.kind === 'file' && isMarkdownFile(entry.name)) {
        out.push({ handle: entry, path: entryPath, name: entry.name });
      }
    }
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

  /**
   * Walk rootDirHandle to the file handle for a normalized path (non-.md assets
   * are never registered in fileRegistry, so they must be resolved on demand).
   * @param {string} normalizedPath
   * @returns {Promise<FileSystemFileHandle|null>}
   */
  async function resolveAssetHandle(normalizedPath) {
    if (!rootDirHandle || !normalizedPath) {
      return null;
    }
    const segments = normalizedPath.split('/').filter(Boolean);
    if (!segments.length) {
      return null;
    }
    try {
      let dir = rootDirHandle;
      for (let i = 0; i < segments.length - 1; i += 1) {
        dir = await dir.getDirectoryHandle(segments[i]);
      }
      return await dir.getFileHandle(segments[segments.length - 1]);
    } catch (error) {
      return null;
    }
  }

  /**
   * Walk dirHandle for `.md` files and register them as documents in AppState,
   * closing the app's currently-active document once the new ones are in place.
   * Shared by openFolder() (fresh picker selection).
   * @param {FileSystemDirectoryHandle} dirHandle
   * @returns {Promise<number>} number of `.md` files registered
   */
  async function registerFolderContents(dirHandle) {
    const files = [];
    await collectMarkdownFiles(dirHandle, '', files);

    const initialActiveId = AppState.getActiveDocumentId();

    rootDirHandle = dirHandle;
    files.forEach(file => {
      const id = AppState.openDocument('', { path: file.path, name: file.name, loaded: false });
      fileRegistry.set(id, { handle: file.handle, path: file.path, name: file.name, loaded: false });
      pathIndex.set(file.path, id);
    });

    // MEW-002 has no API for replacing the app's launch document in place, so the
    // initial document is closed once the folder's documents are registered;
    // AppState.closeDocument() falls back to one of the newly-opened documents
    // (or a fresh empty one if the folder had no .md files). Multi-tab UX
    // refinement is deferred to MEW-012.
    if (typeof initialActiveId === 'string') {
      AppState.closeDocument(initialActiveId);
    }

    return files.length;
  }

  /**
   * Global directory/file-tree manager for the File System Access API integration.
   */
  const Directory = {
    /**
     * Open a folder via showDirectoryPicker, register all `.md` files found in it
     * (recursively) as documents in AppState, and close the app's initial document.
     * File contents are not read here; activateDocument() loads them lazily.
     * @returns {Promise<{ opened: boolean, reason?: 'unsupported'|'cancelled', count?: number }>}
     */
    async openFolder() {
      if (typeof global.showDirectoryPicker !== 'function') {
        return { opened: false, reason: 'unsupported' };
      }

      let dirHandle;
      try {
        dirHandle = await global.showDirectoryPicker();
      } catch (error) {
        return { opened: false, reason: 'cancelled' };
      }

      const count = await registerFolderContents(dirHandle);

      return { opened: true, count };
    },

    /**
     * Switch to the given document, lazily loading its file contents on first
     * activation. Subsequent activations reuse the cached (loaded) text.
     * @param {string} id
     * @returns {Promise<void>}
     */
    async activateDocument(id) {
      AppState.switchActiveDocument(id);

      const entry = fileRegistry.get(id);
      if (!entry || entry.loaded) {
        return;
      }

      let text;
      try {
        const file = await entry.handle.getFile();
        text = await file.text();
      } catch (error) {
        // Safe-side fallback (mirrors preview.js's renderSanitizerUnavailableError
        // pattern): leave the document empty rather than throwing, so a missing or
        // permission-revoked file doesn't break the rest of the app.
        console.warn('[Directory] Failed to read file for document.', id, error);
        return;
      }

      if (AppState.getActiveDocumentId() === id) {
        entry.loaded = true;
        AppState.setText(text, 'switch');
      }
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
     * Folder-relative path of the currently active document, or null if the
     * active document is not directory-backed (or no folder is open).
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
     * folder path of the document it appears in.
     * @param {string} fromPath folder-relative path of the referencing document
     * @param {string} ref relative reference from the Markdown (e.g. "../images/pic.png")
     * @returns {Promise<{ type: 'document', id: string, path: string }|{ type: 'asset', path: string, handle: FileSystemFileHandle }|null>}
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
      const handle = await resolveAssetHandle(normalizedPath);
      if (!handle) {
        return null;
      }
      return { type: 'asset', path: normalizedPath, handle };
    }
  };

  // Expose internals for unit testing via window.__directoryTest
  global.__directoryTest = {
    getRegistrySize: () => fileRegistry.size
  };

  global.Directory = Directory;
})(window);
