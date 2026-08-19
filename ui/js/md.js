// markdown renderer: vendored marked (full GFM) sanitized by vendored DOMPurify.
// Both load as classic scripts in index.html before this module runs (UMD
// globals — see ui/vendor/README.md), so the UI stays zero-network. Board
// content is agent-written: marked passes raw HTML through, so EVERY render is
// sanitized — and if DOMPurify is missing or unsupported, md() fails closed to
// escaped text rather than ever returning live HTML.
//
// Rendering is a two-step contract: insert md(src) as innerHTML, then call
// mdEnhance(container) on the surrounding element. The enhance pass adds copy
// buttons to code blocks, lazy-loads highlight.js for syntax color, and
// lazy-loads mermaid to swap ```mermaid fences for inline diagrams (click =
// fullscreen). Each enhancement is per-node guarded, so calling mdEnhance
// again after a re-render is cheap and idempotent.
import { esc } from './util.js';

// Where an <img> in board markdown actually points. Markdown has no base of its
// own — it renders into the board page — so `![](shot.png)` beside a document
// asks the board for /shot.png and 404s. Two sources are rewritten:
//   attachment://<id>  → the attachment serve (works in a card body too)
//   a relative path    → the file next to the document, through the same
//                        directory serve an html artifact's relative refs use
// Everything else — absolute url, /api/…, data:, a bare #anchor — is left
// exactly as written. `base` is the document's own directory (uriDir of its
// uri); without one there is nothing for a relative path to resolve against, so
// it stays untouched. Returns '' for "leave this src alone".
export function mdImgSrc(src, base) {
  const s = String(src == null ? '' : src).trim();
  const am = /^attachment:\/\/([^/?#]+)/.exec(s);
  if (am) return '/api/attachments/' + encodeURIComponent(am[1]);
  if (!s || !base) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s[0] === '/' || s[0] === '#') return '';
  const rel = s.replace(/^\.\//, '');
  return '/artifacts/' + encodeURIComponent(base) + '/' + rel.split('/').map(encodeURIComponent).join('/');
}

// Keep harmless formatting HTML; no author-supplied SVG/MathML, styles or form
// controls (input stays: GFM task lists render as disabled checkboxes).
// Scripts, event handlers and iframes are gone by DOMPurify default.
const SANITIZE = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['style', 'form', 'textarea', 'select', 'button', 'dialog'],
  ADD_ATTR: ['target'],
};

// The document currently being rendered, for the image hook below. md() is
// synchronous end to end (marked.parse + DOMPurify.sanitize), so this is set and
// cleared around the one sanitize call it belongs to.
let mdBase = '';

let configured = false;
function configure(m, dp) {
  if (configured) return;
  configured = true;
  m.use({ gfm: true, breaks: true }); // breaks: single newline = <br>, as before
  // links open in a new tab (the board is an SPA) — same policy as the old renderer
  dp.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('href')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener');
    }
  });
  // Image sources are rewritten INSIDE the sanitize, on the real node, before
  // DOMPurify's URI check — never by patching the html string on the way in.
  // It has to be here and not in the enhance pass: `attachment://id` is an
  // unknown scheme, so the check would drop the attribute and the id with it.
  // What the hook produces is a plain relative path, which is then validated
  // like any other.
  dp.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName !== 'src' || node.tagName !== 'IMG') return;
    const to = mdImgSrc(data.attrValue, mdBase);
    if (to) data.attrValue = to;
  });
}

// `base` (optional): the directory of the document this markdown IS — a card
// artifact's folder — so an image beside it resolves. Text with no file of its
// own (a card body, a chat message) passes none, and only attachment:// images
// resolve there.
export function md(src, base) {
  const m = globalThis.marked, dp = globalThis.DOMPurify;
  if (!m || !dp || !dp.isSupported) return '<pre>' + esc(src || '') + '</pre>'; // fail closed
  configure(m, dp);
  mdBase = base || '';
  try { return dp.sanitize(m.parse(src || ''), SANITIZE); }
  finally { mdBase = ''; }
}

// ---------- post-render enhancement ----------

// one-shot script loader for the lazy vendors (highlight.js, mermaid, and —
// from fileedit.js — CodeMirror): one fetch per src, shared by every caller
const scriptP = {};
export function loadScript(src, ready) {
  if (!scriptP[src]) scriptP[src] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve(ready());
    s.onerror = () => { delete scriptP[src]; reject(new Error('failed to load ' + src)); };
    document.head.appendChild(s);
  });
  return scriptP[src];
}
const loadHljs = () => loadScript('/ui/vendor/highlight.min.js', () => globalThis.hljs);
const loadMermaid = () => loadScript('/ui/vendor/mermaid.min.js', () => {
  const mm = globalThis.mermaid;
  // htmlLabels off everywhere: pure-SVG text survives the SVG sanitize profile
  // below (foreignObject/HTML labels would be stripped = silently empty nodes)
  mm.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'dark',
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    class: { htmlLabels: false },
  });
  return mm;
});

export function mdEnhance(root) {
  if (!root || !root.querySelectorAll) return;
  for (const code of root.querySelectorAll('pre > code')) {
    const pre = code.parentElement;
    if (/\blanguage-mermaid\b/.test(code.className) && pre.dataset.mmd !== 'err') {
      renderMermaid(pre, code);
      continue;
    }
    addCopyButton(pre, code);
    if (!code.dataset.hl) { code.dataset.hl = '1'; loadHljs().then((h) => h.highlightElement(code)).catch(() => {}); }
  }
}

// ---------- clipboard ----------
// The one copy helper behind every copy affordance (code blocks, message
// bubbles, artifact viewer). navigator.clipboard requires a secure context —
// over plain HTTP (tailnet IP) it is undefined, so the hidden-textarea
// execCommand path is the one that actually runs there. execCommand only works
// inside a real user gesture, so that branch must reach it synchronously from
// the click: the clipboard check throws no await in the way.
export function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true, () => execCopy(text));
  }
  return Promise.resolve(execCopy(text));
}
function execCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const done = document.execCommand('copy');
    ta.remove();
    return done;
  } catch (e) { return false; }
}

// ---------- code blocks: copy button ----------
// The button lives in a position:relative wrapper AROUND the pre (not inside
// it) so it stays put when the code scrolls horizontally. Hover-reveal on
// pointer devices; always faintly visible on touch (see app.css).
function addCopyButton(pre, code) {
  if (pre.parentElement && pre.parentElement.classList.contains('codewrap')) return;
  const wrap = document.createElement('div');
  wrap.className = 'codewrap';
  pre.replaceWith(wrap);
  wrap.appendChild(pre);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'copy-btn';
  btn.textContent = 'copy';
  btn.setAttribute('aria-label', 'copy code to clipboard');
  btn.onclick = () => copyText(code.textContent).then((done) => {
    btn.textContent = done ? '✓ copied' : 'failed';
    btn.classList.toggle('ok', done);
    setTimeout(() => { btn.textContent = 'copy'; btn.classList.remove('ok'); }, 1500);
  });
  wrap.appendChild(btn);
}

// ---------- mermaid diagrams ----------
// A ```mermaid fence arrives from md() as an (escaped, sanitized) code block.
// The enhance pass validates + renders it to SVG, sanitizes THAT with an
// SVG-keeping profile, and swaps the pre for an inline <figure>. A fence that
// fails to parse keeps its plain code block (marked err so it isn't retried
// every render). Rendered SVG is cached by source: chat feeds rebuild their
// innerHTML on every push, and re-parsing every diagram each time would flash.
const SVG_SANITIZE = { USE_PROFILES: { svg: true, svgFilters: true } };
const mmdCache = new Map(); // fence source -> sanitized svg
let mmdSeq = 0;

function renderMermaid(pre, code) {
  if (pre.dataset.mmd) return; // swapped or in flight
  pre.dataset.mmd = '1';
  const src = code.textContent;
  const cached = mmdCache.get(src);
  if (cached) return swapInDiagram(pre, cached);
  loadMermaid().then(async (mm) => {
    try {
      await mm.parse(src); // throws on bad source, before render can touch the DOM
      const { svg } = await mm.render('bc-mmd-' + (++mmdSeq), src);
      const clean = globalThis.DOMPurify.sanitize(svg, SVG_SANITIZE);
      mmdCache.set(src, clean);
      if (mmdCache.size > 100) mmdCache.delete(mmdCache.keys().next().value);
      swapInDiagram(pre, clean);
    } catch (e) {
      failMermaid(pre, code);
    }
  }).catch(() => failMermaid(pre, code)); // vendor script failed to load
}

function failMermaid(pre, code) {
  if (!pre.isConnected) return;
  pre.dataset.mmd = 'err'; // fall back to the plain code block, don't retry
  addCopyButton(pre, code);
}

function swapInDiagram(pre, svg) {
  if (!pre.isConnected) return; // the surface re-rendered while we parsed
  const fig = document.createElement('figure');
  fig.className = 'mmd';
  fig.title = 'click to expand';
  fig.innerHTML = svg;
  fig.onclick = () => openDiagramOverlay(svg);
  pre.replaceWith(fig);
}

// fullscreen diagram overlay (phone-readable): Esc / tap-out / ✕ closes.
// Built lazily on first use; capture-phase Esc so main.js's global Escape
// handler (close viewer/detail/…) never also fires underneath it.
let mmdOverlay = null;
function overlayEl() {
  if (mmdOverlay) return mmdOverlay;
  mmdOverlay = document.createElement('div');
  mmdOverlay.id = 'mmd-overlay';
  mmdOverlay.hidden = true;
  mmdOverlay.innerHTML = '<button id="mmd-close" title="close">✕</button><div id="mmd-full"></div>';
  mmdOverlay.onclick = (e) => {
    if (e.target === mmdOverlay || e.target.closest('#mmd-close')) closeDiagramOverlay();
  };
  document.body.appendChild(mmdOverlay);
  return mmdOverlay;
}
function onOverlayKey(e) {
  if (e.key !== 'Escape') return;
  e.preventDefault();
  e.stopPropagation();
  closeDiagramOverlay();
}
function openDiagramOverlay(svg) {
  const ov = overlayEl();
  ov.querySelector('#mmd-full').innerHTML = svg;
  ov.hidden = false;
  document.addEventListener('keydown', onOverlayKey, true);
}
function closeDiagramOverlay() {
  overlayEl().hidden = true;
  document.removeEventListener('keydown', onOverlayKey, true);
}
