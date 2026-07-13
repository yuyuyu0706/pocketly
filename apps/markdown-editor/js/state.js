(function (global) {
  'use strict';

  const STORAGE_KEYS = {
    text: 'md:text',
    settings: 'md:settings'
  };

  const DEFAULT_SETTINGS = {
    lang: 'en',
    showLineNumbers: false
  };

  const state = {
    docText: '',
    settings: Object.assign({}, DEFAULT_SETTINGS),
    cursor: { start: 0, end: 0, direction: 'f' },
    history: { undo: [], redo: [] }
  };

  const TEXT_SAVE_DEBOUNCE = 300;
  const INERT_TEXT_PATTERN = /[\s\u200B\u200C\u200D\uFEFF]+/g;
  let textSaveTimer = null;
  let fallbackDocText = '';

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

  function analyzeText(rawText) {
    const normalized = normalizeText(rawText);
    const stripped = normalized.replace(INERT_TEXT_PATTERN, '');
    const hasMeaningful = stripped.length > 0;
    return { normalized, hasMeaningful };
  }

  function persistTextValue(text) {
    const { normalized, hasMeaningful } = analyzeText(text);
    if (!hasMeaningful || (fallbackDocText && normalized === fallbackDocText)) {
      safeRemoveItem(STORAGE_KEYS.text);
      return;
    }
    safeSetItem(STORAGE_KEYS.text, normalized);
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
    persistTextValue(state.docText);
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

      safeRemoveItem(STORAGE_KEYS.text);
      safeRemoveItem(STORAGE_KEYS.settings);

      state.docText = nextText;
      state.settings = mergeSettings(initial && initial.settings);

      scheduleTextPersist(state.docText);
      Bus.emit('text:changed', { text: state.docText, source: 'init' });
    },
    /**
     * Retrieve the current markdown text.
     * @returns {string}
     */
    getText() {
      return state.docText;
    },
    /**
     * Update the markdown text and notify listeners.
     * @param {string} next
     * @param {'editor'|'state'|'init'} [source='state']
     * @returns {void}
     */
    setText(next, source = 'state') {
      if (typeof next !== 'string') {
        return;
      }
      if (next === state.docText) {
        return;
      }
      state.docText = next;
      scheduleTextPersist(state.docText);
      Bus.emit('text:changed', { text: state.docText, source });
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
     * Retrieve the last known cursor position.
     * @returns {{ start: number, end: number, direction?: 'f'|'b' }}
     */
    getCursor() {
      return Object.assign({}, state.cursor);
    },
    /**
     * Store the current cursor position.
     * @param {{ start?: number, end?: number, direction?: 'f'|'b' }} cursor
     * @returns {void}
     */
    setCursor(cursor) {
      if (!isPlainObject(cursor)) {
        return;
      }
      state.cursor = Object.assign({}, state.cursor, cursor);
    },
    /** Placeholder for future undo support. */
    undo() {},
    /** Placeholder for future redo support. */
    redo() {},
    /** Placeholder for future patch application. */
    applyPatch() {}
  };

  global.AppState = AppState;
})(window);
