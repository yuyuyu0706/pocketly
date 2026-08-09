(function (global) {
  'use strict';

  const STORAGE_KEYS = {
    text: 'md:text',
    settings: 'md:settings'
  };

  const DEFAULT_SETTINGS = {
    lang: 'en',
    showLineNumbers: false,
    mode: 'read'
  };

  // Internal storage is a collection of documents keyed by id, plus the id of the
  // document currently being viewed/edited. Existing public APIs (getText/setText/
  // getCursor/setCursor) operate on the active document only, preserving their
  // original signatures for the 24 existing call sites across preview.js/toc.js/
  // export.js/script.js/formatting.js/layout.js.
  //
  // Persistence scope (see Issue #151): only the active document's text is persisted
  // (md:text session storage), matching current behavior. Documents opened via
  // openDocument() beyond the active one live in memory only and are lost on reload.
  // Full multi-document persistence is the responsibility of MEW-005 (Lv2-6).
  const state = {
    documents: new Map(), // id -> { id, text, cursor, createdAt }
    activeDocumentId: null,
    activeHistory: [], // recently-active document ids (most recent last), for closeDocument fallback
    settings: Object.assign({}, DEFAULT_SETTINGS),
    history: { undo: [], redo: [] }
  };

  const TEXT_SAVE_DEBOUNCE = 300;
  const INERT_TEXT_PATTERN = /[\s\u200B\u200C\u200D\uFEFF]+/g;
  let textSaveTimer = null;
  let fallbackDocText = '';
  let nextDocumentId = 1;

  function generateDocumentId() {
    const id = `doc-${nextDocumentId}`;
    nextDocumentId += 1;
    return id;
  }

  function createDocumentRecord(text, meta) {
    return {
      id: generateDocumentId(),
      text: normalizeText(text),
      cursor: { start: 0, end: 0, direction: 'f' },
      createdAt: Date.now(),
      meta: isPlainObject(meta) ? Object.assign({}, meta) : {}
    };
  }

  function getActiveDocument() {
    return state.documents.get(state.activeDocumentId) || null;
  }

  function touchActiveHistory(id) {
    const idx = state.activeHistory.indexOf(id);
    if (idx !== -1) {
      state.activeHistory.splice(idx, 1);
    }
    state.activeHistory.push(id);
  }

  function isPlainObject(value) {
    return Object.prototype.toString.call(value) === '[object Object]';
  }

  function safeGetItem(key) {
    try {
      return global.localStorage.getItem(key);
    } catch (error) {
      console.warn('[AppState] Unable to read from localStorage.', error);
      return null;
    }
  }

  function safeSetItem(key, value) {
    try {
      global.localStorage.setItem(key, value);
    } catch (error) {
      console.warn('[AppState] Unable to write to localStorage.', error);
    }
  }

  function safeRemoveItem(key) {
    try {
      global.localStorage.removeItem(key);
    } catch (error) {
      console.warn('[AppState] Unable to remove from localStorage.', error);
    }
  }

  function safeGetSessionItem(key) {
    try {
      return global.sessionStorage.getItem(key);
    } catch (error) {
      console.warn('[AppState] Unable to read from sessionStorage.', error);
      return null;
    }
  }

  function safeSetSessionItem(key, value) {
    try {
      global.sessionStorage.setItem(key, value);
    } catch (error) {
      console.warn('[AppState] Unable to write to sessionStorage.', error);
    }
  }

  function safeRemoveSessionItem(key) {
    try {
      global.sessionStorage.removeItem(key);
    } catch (error) {
      console.warn('[AppState] Unable to remove from sessionStorage.', error);
    }
  }

  function analyzeText(rawText) {
    const normalized = normalizeText(rawText);
    const stripped = normalized.replace(INERT_TEXT_PATTERN, '');
    const hasMeaningful = stripped.length > 0;
    return { normalized, hasMeaningful };
  }

  function persistTextValue(text) {
    const { normalized, hasMeaningful } = analyzeText(text);
    if (!hasMeaningful || (fallbackDocText && normalized === fallbackDocText)) {
      safeRemoveSessionItem(STORAGE_KEYS.text);
      return;
    }
    safeSetSessionItem(STORAGE_KEYS.text, normalized);
  }

  function scheduleTextPersist(text) {
    if (typeof global.setTimeout !== 'function') {
      persistTextValue(text);
      return;
    }
    if (textSaveTimer) {
      global.clearTimeout(textSaveTimer);
    }
    textSaveTimer = global.setTimeout(() => {
      persistTextValue(text);
      textSaveTimer = null;
    }, TEXT_SAVE_DEBOUNCE);
  }

  function flushPendingTextPersist() {
    if (!textSaveTimer) {
      return;
    }
    global.clearTimeout(textSaveTimer);
    textSaveTimer = null;
    const active = getActiveDocument();
    persistTextValue(active ? active.text : '');
  }

  if (typeof global.addEventListener === 'function') {
    const persistOnUnload = () => {
      flushPendingTextPersist();
    };
    global.addEventListener('beforeunload', persistOnUnload, { capture: true });
    global.addEventListener('pagehide', persistOnUnload, { capture: true });
  }

  function readStoredSettings() {
    const raw = safeGetItem(STORAGE_KEYS.settings);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw);
      return isPlainObject(parsed) ? parsed : null;
    } catch (error) {
      console.warn('[AppState] Failed to parse stored settings.', error);
      return null;
    }
  }

  function persistSettings() {
    try {
      safeSetItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
    } catch (error) {
      console.warn('[AppState] Failed to persist settings.', error);
    }
  }

  function normalizeText(text) {
    return typeof text === 'string' ? text : '';
  }

  function mergeSettings(initialSettings) {
    const provided = isPlainObject(initialSettings) ? initialSettings : {};
    const stored = readStoredSettings();
    return Object.assign({}, DEFAULT_SETTINGS, provided, stored || {});
  }

  /**
   * Global application state manager.
   */
  const AppState = {
    STORAGE_KEYS,
    /**
     * Initialize state from optional initial values and persisted storage.
     * @param {{ text?: string, settings?: object }} [initial]
     * @returns {void}
     */
    init(initial) {
      const initialText = initial && typeof initial.text === 'string' ? initial.text : '';
      const nextText = normalizeText(initialText);
      fallbackDocText = nextText;

      safeRemoveItem(STORAGE_KEYS.settings);

      const storedRaw = safeGetSessionItem(STORAGE_KEYS.text);
      const { normalized: restoredText, hasMeaningful } =
        storedRaw !== null ? analyzeText(storedRaw) : { normalized: '', hasMeaningful: false };

      state.documents = new Map();
      state.activeHistory = [];
      const record = createDocumentRecord(hasMeaningful ? restoredText : nextText);
      state.documents.set(record.id, record);
      state.activeDocumentId = record.id;
      touchActiveHistory(record.id);

      state.settings = mergeSettings(initial && initial.settings);

      scheduleTextPersist(record.text);
      Bus.emit('text:changed', { text: record.text, source: 'init' });
    },
    /**
     * Retrieve the current markdown text of the active document.
     * @returns {string}
     */
    getText() {
      const active = getActiveDocument();
      return active ? active.text : '';
    },
    /**
     * Update the active document's text and notify listeners.
     * @param {string} next
     * @param {'editor'|'state'|'init'|'switch'} [source='state']
     * @returns {void}
     */
    setText(next, source = 'state') {
      if (typeof next !== 'string') {
        return;
      }
      const active = getActiveDocument();
      if (!active || next === active.text) {
        return;
      }
      active.text = next;
      scheduleTextPersist(active.text);
      Bus.emit('text:changed', { text: active.text, source });
    },
    /**
     * Get a shallow copy of the application settings.
     * @returns {Record<string, any>}
     */
    getSettings() {
      return Object.assign({}, state.settings);
    },
    /**
     * Update a single setting value and notify listeners.
     * @param {string} key
     * @param {any} value
     * @returns {void}
     */
    setSetting(key, value) {
      if (typeof key !== 'string' || !key) {
        return;
      }
      if (state.settings[key] === value) {
        return;
      }
      state.settings = Object.assign({}, state.settings, { [key]: value });
      persistSettings();
      Bus.emit('settings:changed', { key, value });
    },
    /**
     * Retrieve the last known cursor position of the active document.
     * @returns {{ start: number, end: number, direction?: 'f'|'b' }}
     */
    getCursor() {
      const active = getActiveDocument();
      return Object.assign({}, active ? active.cursor : { start: 0, end: 0, direction: 'f' });
    },
    /**
     * Store the current cursor position of the active document.
     * @param {{ start?: number, end?: number, direction?: 'f'|'b' }} cursor
     * @returns {void}
     */
    setCursor(cursor) {
      if (!isPlainObject(cursor)) {
        return;
      }
      const active = getActiveDocument();
      if (!active) {
        return;
      }
      active.cursor = Object.assign({}, active.cursor, cursor);
    },
    /**
     * Add a new document to the collection without switching to it.
     * @param {string} [text='']
     * @param {object} [meta]
     * @returns {string} the new document's id
     */
    openDocument(text, meta) {
      const record = createDocumentRecord(text, meta);
      state.documents.set(record.id, record);
      return record.id;
    },
    /**
     * Remove a document from the collection. If the closed document was active,
     * the active document transitions to (a) the most recently active remaining
     * document, falling back to (b) the first remaining document in insertion
     * order, or (c) a freshly created empty document if none remain.
     * @param {string} id
     * @returns {void}
     */
    closeDocument(id) {
      if (typeof id !== 'string' || !state.documents.has(id)) {
        return;
      }
      const wasActive = id === state.activeDocumentId;
      state.documents.delete(id);
      state.activeHistory = state.activeHistory.filter(historyId => historyId !== id);

      if (!wasActive) {
        return;
      }

      let nextId = null;
      while (state.activeHistory.length && nextId === null) {
        const candidate = state.activeHistory[state.activeHistory.length - 1];
        if (state.documents.has(candidate)) {
          nextId = candidate;
        } else {
          state.activeHistory.pop();
        }
      }
      if (nextId === null) {
        const remaining = state.documents.keys().next();
        nextId = remaining.done ? null : remaining.value;
      }
      if (nextId === null) {
        const record = createDocumentRecord('');
        state.documents.set(record.id, record);
        nextId = record.id;
      }

      state.activeDocumentId = nextId;
      touchActiveHistory(nextId);
      const active = getActiveDocument();
      scheduleTextPersist(active.text);
      Bus.emit('text:changed', { text: active.text, source: 'switch' });
    },
    /**
     * Switch the active document and notify listeners.
     * @param {string} id
     * @returns {void}
     */
    switchActiveDocument(id) {
      if (typeof id !== 'string' || !state.documents.has(id) || id === state.activeDocumentId) {
        return;
      }
      state.activeDocumentId = id;
      touchActiveHistory(id);
      const active = getActiveDocument();
      scheduleTextPersist(active.text);
      Bus.emit('text:changed', { text: active.text, source: 'switch' });
    },
    /**
     * List all open documents in insertion order.
     * @returns {Array<{ id: string, meta: object }>}
     */
    listDocuments() {
      return Array.from(state.documents.values()).map(doc => ({ id: doc.id, meta: Object.assign({}, doc.meta) }));
    },
    /**
     * Retrieve the id of the currently active document.
     * @returns {string|null}
     */
    getActiveDocumentId() {
      return state.activeDocumentId;
    },
    // undo/redo: delegated to the browser's native undo stack via execCommand('insertText')
    // in replaceEditorRange (script.js). A custom AppState undo stack is not needed for
    // the current scope; revisit if fine-grained multi-step undo is required in a future phase.
  };

  // Expose internals for unit testing via window.__stateTest
  global.__stateTest = {
    getDocumentCount: () => state.documents.size,
    getDocumentText: id => (state.documents.has(id) ? state.documents.get(id).text : undefined),
    getActiveHistory: () => state.activeHistory.slice()
  };

  global.AppState = AppState;
})(window);
