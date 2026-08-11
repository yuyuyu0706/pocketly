(function () {
  const LANGUAGE_STORAGE_KEY = 'markdown-editor-language';
  const LANGUAGE_SOURCE_STORAGE_KEY = 'markdown-editor-language-source';
  const SUPPORTED_LANGUAGES = ['en', 'ja'];
  const BUILT_IN_DICTIONARIES = {
    en: {
      app: {
        title: 'Markdown Editor Blue'
      },
      toolbar: {
        open: '📂 Open',
        save: '💾 Save',
        exportPdf: '📄 Export PDF',
        exportHtml: '🌐 Export HTML',
        insertImage: '🖼 Insert Image',
        template: '📋 Templates',
        help: '❔ Help',
        languageLabel: 'Language',
        showLineNumbers: '🔢 Show Line Numbers',
        hideLineNumbers: '🔢 Hide Line Numbers'
      },
      language: {
        english: 'English',
        japanese: '日本語'
      },
      templates: {
        meetingNotes: 'Meeting Notes',
        systemChangeOverview: 'System Change Overview',
        systemChangeChecklist: 'System Change Checklist',
        readme: 'Readme',
        releaseNotes: 'Release Notes'
      },
      dialogs: {
        replaceFile: 'Replace the current content with the selected file?',
        fileReadErrorLog: 'Failed to load the Markdown file',
        fileReadErrorAlert:
          'Failed to load the Markdown file. Please check the file and try again.',
        replaceTemplate: 'Replace the current content with the selected template?',
        templateLoadErrorLog: 'Failed to load the template',
        templateLoadErrorAlert:
          'Failed to load the template. Please make sure the template files are available.',
        saveFilenamePrompt: 'Enter a file name to save',
        defaultFileName: 'document.md',
        defaultHtmlFileName: 'preview.html',
        previewTitle: 'Preview'
      },
      editor: {
        placeholder: 'Type Markdown here...'
      },
      help: {
        close: 'Close',
        markdownTitle: 'Markdown Cheat Sheet',
        markdownCheatsheet:
          '# Heading 1\n## Heading 2\n\n- List\n1. Numbered list\n\n**Bold** *Italic*\n> Quote\n`Code`\n\n```\nCode block\n```\n\n[Link](URL)',
        mermaidTitle: 'Mermaid Cheat Sheet',
        mermaidCheatsheet:
          '```mermaid\ngraph TD\n  A[Start] --> B{Condition}\n  B -->|Yes| C[Process 1]\n  B -->|No| D[Process 2]\n```'
      },
      formatting: {
        bold: '𝐁 Bold',
        externalLink: '🔗 Add External Link',
        copy: '📋 Copy',
        paste: '📥 Paste'
      },
      image: {
        fallback: '[Image: {filename}]',
        markdownTemplate:
          '\n<!-- image:{filename} -->\n[Image: {filename}]\n<!-- /image -->\n'
      }
    },
    ja: {
      app: {
        title: 'Markdown Editor Blue'
      },
      toolbar: {
        open: '📂 開く',
        save: '💾 保存',
        exportPdf: '📄 PDF出力',
        exportHtml: '🌐 HTML出力',
        insertImage: '🖼 画像を挿入',
        template: '📋 テンプレート',
        help: '❔ ヘルプ',
        languageLabel: '言語',
        showLineNumbers: '🔢 行番号を表示',
        hideLineNumbers: '🔢 行番号を非表示'
      },
      language: {
        english: 'English',
        japanese: '日本語'
      },
      templates: {
        meetingNotes: '議事録',
        systemChangeOverview: 'システム変更概要',
        systemChangeChecklist: 'システム変更チェックリスト',
        readme: 'Readme',
        releaseNotes: 'リリースノート'
      },
      dialogs: {
        replaceFile: '現在の内容を開くファイルの内容で置き換えます。よろしいですか？',
        fileReadErrorLog: 'Markdownファイルの読み込みに失敗しました',
        fileReadErrorAlert:
          'Markdownファイルの読み込みに失敗しました。ファイルを確認してください。',
        replaceTemplate: '現在の内容をテンプレートで置き換えます。よろしいですか？',
        templateLoadErrorLog: 'テンプレートの読み込みに失敗しました',
        templateLoadErrorAlert:
          'テンプレートの読み込みに失敗しました。テンプレートファイルの配置を確認してください。',
        saveFilenamePrompt: '保存するファイル名を入力してください',
        defaultFileName: 'document.md',
        defaultHtmlFileName: 'preview.html',
        previewTitle: 'プレビュー'
      },
      editor: {
        placeholder: 'ここにMarkdownを入力...'
      },
      help: {
        close: '閉じる',
        markdownTitle: 'Markdown チートシート',
        markdownCheatsheet:
          '# 見出し1\n## 見出し2\n\n- リスト\n1. 番号付きリスト\n\n**太字** *斜体*\n> 引用\n`コード`\n\n```\nコードブロック\n```\n\n[リンク](URL)',
        mermaidTitle: 'Mermaid チートシート',
        mermaidCheatsheet:
          '```mermaid\ngraph TD\n  A[開始] --> B{条件}\n  B -->|はい| C[処理1]\n  B -->|いいえ| D[処理2]\n```'
      },
      formatting: {
        bold: '太字',
        externalLink: '🔗 外部リンクを追加',
        copy: '📋 コピー',
        paste: '📥 ペースト'
      },
      image: {
        fallback: '[画像: {filename}]',
        markdownTemplate:
          '\n<!-- image:{filename} -->\n[画像: {filename}]\n<!-- /image -->\n'
      }
    }
  };

  function cloneDictionary(dictionary) {
    if (!dictionary) {
      return null;
    }
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(dictionary);
      } catch (error) {
        // Fallback to JSON-based cloning below if structuredClone fails.
      }
    }
    return JSON.parse(JSON.stringify(dictionary));
  }

  const embeddedDictionaries = (() => {
    const configDictionaries =
      (window.APP_CONFIG && window.APP_CONFIG.embeddedDictionaries) || {};
    return Object.assign({}, BUILT_IN_DICTIONARIES, configDictionaries);
  })();

  function getEmbeddedDictionary(lang) {
    const dictionary = embeddedDictionaries[lang];
    return dictionary ? cloneDictionary(dictionary) : null;
  }

  let config = { defaultLanguage: 'en' };
  const dictionaries = new Map();
  let fallbackDictionary = {};
  let currentDictionary = {};
  let currentLanguage = 'en';
  let initialized = false;

  function normalizeLanguage(lang) {
    if (typeof lang !== 'string') {
      return null;
    }
    const trimmed = lang.trim();
    if (!trimmed) {
      return null;
    }
    const lower = trimmed.toLowerCase();
    const [base] = lower.split('-');
    return base;
  }

  function isSupported(lang) {
    return SUPPORTED_LANGUAGES.includes(lang);
  }

  function getDefaultLanguage() {
    const configured = normalizeLanguage(config.defaultLanguage);
    if (configured && isSupported(configured)) {
      return configured;
    }
    return 'en';
  }

  function removeStoredLanguage() {
    try {
      localStorage.removeItem(LANGUAGE_STORAGE_KEY);
      localStorage.removeItem(LANGUAGE_SOURCE_STORAGE_KEY);
    } catch (error) {
      console.warn('[i18n] Unable to clear stored language.', error);
    }
  }

  function persistStoredLanguage(lang, source) {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
      localStorage.setItem(LANGUAGE_SOURCE_STORAGE_KEY, source);
    } catch (error) {
      console.warn('[i18n] Unable to persist language selection.', error);
    }
  }

  function getStoredLanguage() {
    try {
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (!stored) {
        return null;
      }

      const normalized = normalizeLanguage(stored);
      if (!normalized) {
        removeStoredLanguage();
        return null;
      }

      const source = localStorage.getItem(LANGUAGE_SOURCE_STORAGE_KEY) || '';
      if (source !== 'user') {
        removeStoredLanguage();
        return null;
      }

      return { lang: normalized, source };
    } catch (error) {
      console.warn('[i18n] Unable to access localStorage.', error);
      return null;
    }
  }

  function getBrowserLanguage() {
    const candidates = [];
    if (Array.isArray(navigator.languages)) {
      candidates.push(...navigator.languages);
    }
    if (navigator.language) {
      candidates.push(navigator.language);
    }
    for (const candidate of candidates) {
      const normalized = normalizeLanguage(candidate);
      if (normalized && isSupported(normalized)) {
        return normalized;
      }
    }
    return null;
  }

  async function loadDictionary(lang) {
    if (dictionaries.has(lang)) {
      return dictionaries.get(lang);
    }

    try {
      const response = await fetch(`i18n/${lang}.json`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to load dictionary: ${lang}`);
      }
      const dict = await response.json();
      dictionaries.set(lang, dict);
      return dict;
    } catch (error) {
      const embedded = getEmbeddedDictionary(lang);
      if (embedded) {
        if (window.location && window.location.protocol === 'file:') {
          console.info(`[i18n] Using embedded ${lang} dictionary for file protocol.`);
        } else {
          console.warn(`[i18n] Falling back to embedded ${lang} dictionary.`, error);
        }
        dictionaries.set(lang, embedded);
        return embedded;
      }

      if (lang !== 'en') {
        console.warn(`[i18n] Falling back to English dictionary for ${lang}.`, error);
        const fallback = await loadDictionary('en');
        dictionaries.set(lang, fallback);
        return fallback;
      }

      throw error;
    }
  }

  function getMessage(dict, key) {
    if (!dict) {
      return undefined;
    }
    return key.split('.').reduce((acc, part) => {
      if (acc && Object.prototype.hasOwnProperty.call(acc, part)) {
        return acc[part];
      }
      return undefined;
    }, dict);
  }

  function formatMessage(template, params) {
    if (typeof template !== 'string') {
      return template;
    }
    if (!params) {
      return template;
    }
    return template.replace(/\{([^}]+)\}/g, (match, token) => {
      if (Object.prototype.hasOwnProperty.call(params, token)) {
        const value = params[token];
        return value == null ? '' : String(value);
      }
      return match;
    });
  }

  function applyToElement(element) {
    if (!element || !element.dataset) {
      return;
    }

    if (element.dataset.i18n) {
      const text = t(element.dataset.i18n);
      if (text != null) {
        element.textContent = text;
      }
    }

    Object.entries(element.dataset).forEach(([dataKey, value]) => {
      if (!dataKey.startsWith('i18n') || dataKey === 'i18n') {
        return;
      }
      const suffix = dataKey.slice(4);
      if (!suffix) {
        return;
      }
      const translation = t(value);
      if (translation == null) {
        return;
      }
      switch (suffix) {
        case 'Html':
          element.innerHTML = translation;
          break;
        case 'Text':
          element.textContent = translation;
          break;
        case 'Value':
          if ('value' in element) {
            element.value = translation;
          } else {
            element.setAttribute('value', translation);
          }
          break;
        default: {
          const attrName = suffix
            .replace(/^[A-Z]/, char => char.toLowerCase())
            .replace(/[A-Z]/g, char => `-${char.toLowerCase()}`);
          element.setAttribute(attrName, translation);
        }
      }
    });
  }

  function collectElements(root) {
    if (root instanceof Document) {
      return [root.documentElement, ...root.querySelectorAll('*')];
    }
    if (root instanceof Element || root instanceof DocumentFragment) {
      return [root, ...root.querySelectorAll('*')];
    }
    return [];
  }

  function applyToDOM(root) {
    const scope = root || document;
    const elements = collectElements(scope);
    elements.forEach(element => {
      if (!element || !element.dataset) {
        return;
      }
      const hasI18nKeys = Object.keys(element.dataset).some(key =>
        key === 'i18n' || key.startsWith('i18n')
      );
      if (hasI18nKeys) {
        applyToElement(element);
      }
    });
  }

  function resolveInitialLanguage() {
    const params = new URLSearchParams(window.location.search);
    const queryLang = normalizeLanguage(params.get('lang'));
    if (queryLang && isSupported(queryLang)) {
      return { lang: queryLang, source: 'query' };
    }

    const stored = getStoredLanguage();
    if (stored && isSupported(stored.lang)) {
      return stored;
    }

    const defaultLang = getDefaultLanguage();
    if (defaultLang) {
      return { lang: defaultLang, source: 'default' };
    }

    const browserLang = getBrowserLanguage();
    if (browserLang) {
      return { lang: browserLang, source: 'browser' };
    }

    return { lang: 'en', source: 'fallback' };
  }

  async function setLang(lang, options = {}) {
    const { persist } = options;
    const normalized = normalizeLanguage(lang) || getDefaultLanguage();
    const target = isSupported(normalized) ? normalized : getDefaultLanguage();
    if (target === currentLanguage && initialized) {
      return currentLanguage;
    }

    let dictionary = fallbackDictionary;
    let fallbackUsed = false;
    if (target !== 'en') {
      try {
        dictionary = await loadDictionary(target);
      } catch (error) {
        console.warn(`[i18n] Failed to load dictionary for ${target}.`, error);
        dictionary = fallbackDictionary;
        fallbackUsed = true;
      }
    }

    currentLanguage = fallbackUsed ? 'en' : target;
    currentDictionary = dictionary;
    document.documentElement.setAttribute('lang', currentLanguage);

    const shouldPersist = typeof persist === 'boolean' ? persist : initialized;
    if (shouldPersist) {
      persistStoredLanguage(currentLanguage, options.source || 'user');
    }

    applyToDOM();
    document.dispatchEvent(
      new CustomEvent('i18n:change', { detail: { lang: currentLanguage } })
    );
    return currentLanguage;
  }

  function t(key, params) {
    if (typeof key !== 'string' || !key) {
      return key;
    }
    const message = getMessage(currentDictionary, key);
    if (message != null) {
      return formatMessage(message, params);
    }
    const fallback = getMessage(fallbackDictionary, key);
    if (fallback != null) {
      return formatMessage(fallback, params);
    }
    return key;
  }

  async function init() {
    if (initialized) {
      return currentLanguage;
    }

    removeStoredLanguage();

    config = Object.assign({ defaultLanguage: 'en' }, window.APP_CONFIG || {});

    fallbackDictionary = await loadDictionary('en');
    currentDictionary = fallbackDictionary;
    currentLanguage = 'en';
    document.documentElement.setAttribute('lang', currentLanguage);

    const initialSelection = resolveInitialLanguage();
    await setLang(initialSelection.lang, {
      persist: false,
      source: initialSelection.source
    });

    initialized = true;
    return currentLanguage;
  }

  window.i18n = {
    init,
    setLang,
    t,
    applyToDOM,
    getCurrentLang() {
      return currentLanguage;
    },
    getSupportedLanguages() {
      return [...SUPPORTED_LANGUAGES];
    }
  };
})();
