(function (global) {
  'use strict';

  const TARGET_CSS_FILES = ['preview.css', 'document.css'];

  const EXPORT_STYLESHEET_FALLBACK_PREVIEW = String.raw`
body {
  font-family: 'Helvetica Neue', sans-serif;
}

#preview {
  padding: 1rem;
  box-sizing: border-box;
  background-color: #ffffff;
  color: #002244;
}

#preview img,
#preview .mermaid svg {
  max-width: 100%;
  height: auto;
}

.mermaid .label foreignObject > div {
  white-space: pre-wrap;
  word-break: break-all;
  overflow-wrap: anywhere;
}

#preview h1,
#preview h2,
#preview h3,
#preview h4,
#preview h5 {
  border-bottom: 1px solid #aac8ff;
  color: #0055aa;
}

pre {
  background: #dfefff;
  padding: 0.5rem;
  overflow-x: auto;
  border-left: 4px solid #88b4ff;
}

code {
  background: #cce0ff;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  color: #003366;
}

pre code {
  display: block;
  padding: 0;
  background: transparent;
  color: inherit;
}

a {
  color: #0077cc;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

@media print {
  pre {
    white-space: pre-wrap;
    overflow-x: visible;
  }
}
`;

  const EXPORT_STYLESHEET_FALLBACK_DOCUMENT = String.raw`
body {
  margin: 0;
  background-color: #f6faff;
  color: #002244;
}
`;

  function isTargetStylesheet(link) {
    const href = typeof link.href === 'string' ? link.href : '';
    return TARGET_CSS_FILES.some(name => href.endsWith(name) || href.includes('/' + name));
  }

  async function fetchStylesheetText(href) {
    if (typeof fetch === 'function') {
      const response = await fetch(href, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Stylesheet request failed with status ${response.status}`);
      }
      return await response.text();
    }
    return null;
  }

  async function fetchViaXhr(href) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', href, true);
      xhr.responseType = 'text';
      xhr.onload = () => {
        if (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) {
          resolve(xhr.responseText);
        } else {
          reject(new Error(`XHR request failed with status ${xhr.status || '0'} for ${href}`));
        }
      };
      xhr.onerror = () => reject(new Error(`XHR request encountered a network error for ${href}`));
      xhr.send();
    });
  }

  async function getStylesheetText(link) {
    const { sheet } = link;
    if (sheet) {
      try {
        const rules = sheet.cssRules || sheet.rules;
        if (rules && rules.length) {
          return Array.from(rules).map(rule => rule.cssText).join('\n');
        }
      } catch (error) {
        console.warn('[Export] Unable to read stylesheet rules directly.', error);
      }
    }

    const href = typeof link.href === 'string' ? link.href : '';
    if (!href) {
      return null;
    }

    try {
      const text = await fetchStylesheetText(href);
      if (text) {
        return text;
      }
    } catch (error) {
      console.warn('[Export] Failed to fetch stylesheet for HTML export.', error);

      if (href.startsWith('file:') && typeof XMLHttpRequest !== 'undefined') {
        try {
          const text = await fetchViaXhr(href);
          if (typeof text === 'string') {
            return text;
          }
        } catch (xhrError) {
          console.warn('[Export] XHR fallback failed to read stylesheet.', xhrError);
        }
      }
    }

    if (href.startsWith('file:')) {
      console.info('[Export] Using bundled preview styles for file protocol HTML export.');
      return null;
    }

    return '';
  }

  async function getInlineStylesheetContent() {
    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .filter(isTargetStylesheet);

    if (links.length === 0) {
      return EXPORT_STYLESHEET_FALLBACK_PREVIEW + EXPORT_STYLESHEET_FALLBACK_DOCUMENT;
    }

    const parts = [];
    for (const link of links) {
      const text = await getStylesheetText(link);
      if (text === null) {
        const href = typeof link.href === 'string' ? link.href : '';
        if (href.endsWith('preview.css') || href.includes('/preview.css')) {
          parts.push(EXPORT_STYLESHEET_FALLBACK_PREVIEW);
        } else {
          parts.push(EXPORT_STYLESHEET_FALLBACK_DOCUMENT);
        }
      } else if (text !== '') {
        parts.push(text);
      }
    }

    if (parts.length === 0) {
      return EXPORT_STYLESHEET_FALLBACK_PREVIEW + EXPORT_STYLESHEET_FALLBACK_DOCUMENT;
    }

    return parts.join('\n');
  }

  function init({ preview, i18n, triggerDownloadFromBlob, AppState, exportPdfBtn, exportHtmlBtn, saveMdBtn }) {
    if (exportPdfBtn) {
      exportPdfBtn.addEventListener('click', () => {
        const win = window.open('', '', 'width=800,height=600');
        if (!win) {
          return;
        }
        const cssLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
          .filter(isTargetStylesheet);
        const previewTitle = i18n.t('dialogs.previewTitle');
        const langAttr =
          document.documentElement.getAttribute('lang') || i18n.getCurrentLang();
        const linkTags = cssLinks.map(l => `<link rel="stylesheet" href="${l.href}">`).join('');
        const bodyContent = `<div id="preview">${preview.innerHTML}</div>`;

        win.addEventListener('afterprint', () => win.close());

        win.document.open();
        win.document.write(
          `<!DOCTYPE html><html lang="${langAttr}"><head><meta charset="UTF-8"><title>${previewTitle}</title>${linkTags}</head><body>${bodyContent}</body></html>`
        );
        win.document.close();

        win.onload = () => {
          win.focus();
          win.print();
        };
      });
    }

    if (exportHtmlBtn) {
      exportHtmlBtn.addEventListener('click', async () => {
        try {
          if (!preview) {
            throw new Error('Preview element is not available.');
          }

          const previewTitle = i18n.t('dialogs.previewTitle');
          const langAttr =
            document.documentElement.getAttribute('lang') || i18n.getCurrentLang();
          const inlineStyles = await getInlineStylesheetContent();
          let headStyles = '';
          if (inlineStyles) {
            const sanitized = inlineStyles.replace(/<\/style/gi, '<\\/style');
            headStyles = `<style>${sanitized}</style>`;
          }
          const bodyContent = `<div id="preview" class="export-preview">${preview.innerHTML}</div>`;
          const html =
            `<!DOCTYPE html><html lang="${langAttr}"><head><meta charset="UTF-8"><title>${previewTitle}</title>${headStyles}</head><body>${bodyContent}</body></html>`;

          const defaultName = i18n.t('dialogs.defaultHtmlFileName');
          const trimmedName =
            typeof defaultName === 'string' && defaultName.trim()
              ? defaultName.trim()
              : 'preview.html';
          const filename = trimmedName.endsWith('.html')
            ? trimmedName
            : `${trimmedName}.html`;

          triggerDownloadFromBlob(
            new Blob([html], { type: 'text/html;charset=utf-8' }),
            filename
          );
        } catch (error) {
          console.error('[Export] Failed to download preview HTML.', error);
        }
      });
    }

    if (saveMdBtn) {
      saveMdBtn.addEventListener('click', () => {
        const defaultName = i18n.t('dialogs.defaultFileName');
        const trimmedName =
          typeof defaultName === 'string' && defaultName.trim()
            ? defaultName.trim()
            : 'document.md';
        const filename = trimmedName.endsWith('.md') ? trimmedName : `${trimmedName}.md`;

        try {
          triggerDownloadFromBlob(
            new Blob([AppState.getText()], { type: 'text/markdown;charset=utf-8' }),
            filename
          );
        } catch (error) {
          console.error('[Export] Failed to download Markdown file.', error);
        }
      });
    }
  }

  global.Export = { init };
})(typeof window !== 'undefined' ? window : this);
