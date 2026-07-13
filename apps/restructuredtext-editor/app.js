// reST Editor yellow - draft with RstToHtmlCompiler (v0.5.x API)
const STATE_KEY = "rest-editor-yellow/v1";
const DEFAULT_SAMPLE = `reST Editor **yellow**
======================

This is a *draft* live preview editor for **reStructuredText**.

Section
-------

- Live preview (client-side)
- Split panes with draggable divider
- Autosave to localStorage
- Export to HTML / Print to PDF

Inline math: $a^2 + b^2 = c^2$
Block math:

\[ E = mc^2 \]

Code block::

  print("hello, reST")
`;

const el = (id)=>document.getElementById(id);
const status = el('status');
const editor = el('editor');
const preview = el('preview');
const divider = el('divider');
const fileOpen = el('file-open');
const fontSize = el('font-size');

let compiler = null;

async function loadCompiler(){
  if (compiler) return compiler;
  const mod = await import('https://cdn.jsdelivr.net/npm/rst-compiler@0.5.7/dist/index.js');
  const RstToHtmlCompiler = mod.RstToHtmlCompiler || mod.default?.RstToHtmlCompiler;
  if (!RstToHtmlCompiler) throw new Error('RstToHtmlCompiler not available');
  compiler = new RstToHtmlCompiler();
  return compiler;
}

function getState(){ try{ return JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); } catch(_){ return {}; } }
function saveState(obj){ localStorage.setItem(STATE_KEY, JSON.stringify(obj)); }
function setStatus(msg){ status.textContent = msg; }

// KaTeX auto-render: import via import map
import "katex/contrib/auto-render";

function applyMath() {
  const fn = window.renderMathInElement;
  if (typeof fn === "function") {
    fn(preview, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\[", right: "\]", display: true },
        { left: "$", right: "$", display: false },
        { left: "\(", right: "\)", display: false }
      ],
      throwOnError: false
    });
  }
}

// Render with debounce
let renderTimer = 0;
async function render(){
  clearTimeout(renderTimer);
  renderTimer = setTimeout(async () => {
    try{
      const c = await loadCompiler();
      const out = c.compile(editor.value);
      const html = `${out.header || ''}${out.body || ''}`;
      preview.innerHTML = html;
      applyMath();
      setStatus('Rendered ✓');
    }catch(err){
      console.error(err);
      preview.innerHTML = `<pre style="color:#b00020">Render Error: ${String(err)}</pre>`;
      setStatus('Render error');
    }
  }, 120);
}

// Drag divider
(function setupDivider(){
  let startX, startW;
  const editorPane = document.querySelector('.editor-pane');
  divider.addEventListener('mousedown', (e)=>{
    startX = e.clientX;
    startW = editorPane.getBoundingClientRect().width;
    document.body.classList.add('resizing');
    const onMove = (evt)=>{
      const dx = evt.clientX - startX;
      const newW = Math.min(window.innerWidth - 120, Math.max(260, startW + dx));
      editorPane.style.width = newW + 'px';
    };
    const onUp = ()=>{
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.classList.remove('resizing');
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
})();

// File IO
el('btn-open').addEventListener('click', ()=> fileOpen.click());
fileOpen.addEventListener('change', async (e)=>{
  const file = e.target.files?.[0];
  if(!file) return;
  const txt = await file.text();
  editor.value = txt;
  render();
  setStatus(`Loaded: ${file.name}`);
});
el('btn-save').addEventListener('click', ()=>{
  const blob = new Blob([editor.value], { type:'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'document.rst';
  a.click();
  URL.revokeObjectURL(url);
  setStatus('Saved .rst');
});
el('btn-export-html').addEventListener('click', async ()=>{
  try{
    const c = await loadCompiler();
    const out = c.compile(editor.value);
    const doc = `<!doctype html><meta charset="utf-8"><title>export</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<style>${document.querySelector('style#export-style')?.textContent || ''}</style>
<div class="rst-output">${(out.header||'')+(out.body||'')}</div>`;
    const blob = new Blob([doc], {type: 'text/html;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'document.html';
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Exported HTML');
  }catch(err){
    alert('Export failed: ' + err);
  }
});
el('btn-new').addEventListener('click', ()=>{
  if (editor.value.trim() && !confirm('現在の内容を破棄します。よろしいですか？')) return;
  editor.value = DEFAULT_SAMPLE;
  render();
});
el('btn-print').addEventListener('click', ()=>{ window.print(); });

// Editor behavior
editor.addEventListener('input', ()=>{
  const s = getState(); s.content = editor.value; saveState(s);
  render();
});

editor.addEventListener('keyup', (e)=>{
  const txt = editor.value.substring(0, editor.selectionStart);
  const lines = txt.split(/\n/);
  const ln = lines.length;
  const col = lines[lines.length-1].length + 1;
  document.getElementById('cursor').textContent = `Ln ${ln}, Col ${col}`;
});

// Shortcuts
window.addEventListener('keydown', (e)=>{
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'){
    e.preventDefault(); document.getElementById('btn-save').click();
  }
  if (e.altKey && e.key.toLowerCase() === 'o'){
    e.preventDefault(); document.getElementById('btn-open').click();
  }
  if (e.altKey && e.key.toLowerCase() === 'n'){
    e.preventDefault(); document.getElementById('btn-new').click();
  }
});

// Font size
fontSize.addEventListener('change', ()=>{
  editor.style.fontSize = fontSize.value + 'px';
  const s = getState(); s.fontSize = fontSize.value; saveState(s);
});

// Boot
(function init(){
  const s = getState();
  editor.value = s.content || DEFAULT_SAMPLE;
  if (s.fontSize){ fontSize.value = s.fontSize; editor.style.fontSize = s.fontSize + 'px'; }
  render();
  setStatus('Ready.');
})();