(function (global) {
  'use strict';

  const MARKDOWN_EXTENSION = /\.md$/i;

  // Maps AppState document ids to their originating file handle/path/load state.
  // Kept private to this module; Lv3-2 (relative path resolution) will consume it
  // via getTree()/a future accessor rather than reaching into this Map directly.
  const fileRegistry = new Map();

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

      const files = [];
      await collectMarkdownFiles(dirHandle, '', files);

      const initialActiveId = AppState.getActiveDocumentId();

      files.forEach(file => {
        const id = AppState.openDocument('', { path: file.path, name: file.name, loaded: false });
        fileRegistry.set(id, { handle: file.handle, path: file.path, name: file.name, loaded: false });
      });

      // MEW-002 has no API for replacing the app's launch document in place, so the
      // initial document is closed once the folder's documents are registered;
      // AppState.closeDocument() falls back to one of the newly-opened documents
      // (or a fresh empty one if the folder had no .md files). Multi-tab UX
      // refinement is deferred to MEW-012.
      if (typeof initialActiveId === 'string') {
        AppState.closeDocument(initialActiveId);
      }

      return { opened: true, count: files.length };
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

      entry.loaded = true;
      if (AppState.getActiveDocumentId() === id) {
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
    }
  };

  // Expose internals for unit testing via window.__directoryTest
  global.__directoryTest = {
    getRegistrySize: () => fileRegistry.size
  };

  global.Directory = Directory;
})(window);
