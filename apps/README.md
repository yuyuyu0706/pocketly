# Pocketly apps

Pocketly manages the migrated applications under `apps/` with stable kebab-case directory names.

## Official app layout

```text
apps/
├── avro-viewer/
├── csv-gantt-viewer/
├── markdown-editor/
└── restructuredtext-editor/
```

## Asset inventory

| App | Directory | Source | README | Tests | Static/assets | Vendored/external assets |
| --- | --- | --- | --- | --- | --- | --- |
| Markdown Editor | `markdown-editor/` | `index.html`, `script.js`, `js/`, `i18n.js`, `config.js`, `style.css` | `README.md` | `tests/`, `playwright.config.js` | `images/`, `template/`, `docs/`, `i18n/` | `LICENSE`, package metadata for npm dev dependencies |
| CSV Gantt Viewer | `csv-gantt-viewer/` | `index.html`, `app.js`, `main.js`, `js/`, `styles.css`, `config.json` | `README.md` | `tests/`, `playwright.config.js` | `csv/`, `images/` | `html2canvas.min.js`, package metadata for npm dev dependencies |
| Avro Viewer | `avro-viewer/` | `index.html`, `app.js`, `styles.css`, `workers/` | `README.md`, `sample/README.md` | Not included in migrated app | `images/`, `sample/` | `vendor/avsc.js`, `vendor/avsc-LICENSE.txt` |
| reStructuredText Editor | `restructuredtext-editor/` | `index.html`, `app.js`, `style.css` | `README.md` | Not included in migrated app | `assets/`, `images/` | CDN-loaded libraries documented in the app README |
