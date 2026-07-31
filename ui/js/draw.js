// A drawing artifact, on a canvas. The twin of fileedit.js: same host, same
// handle (getValue / selection / replace / destroy), so filepane.js only picks
// a mounter by filename and everything above it goes on treating the drawing
// as a file with text in it.
//
// This is the ONLY file in ui/js that knows React exists. Excalidraw 0.17.6 and
// React 18.3.1 are vendored UMD builds (see ui/vendor/README.md) and lazy-loaded
// on first mount, exactly the way fileedit.js lazy-loads CodeMirror: whoever
// never opens a drawing never pays for the megabyte.
import { loadScript } from './md.js';

const V = '/ui/vendor/';

let libP = null;
function loadLib() {
  if (libP) return libP;
  // The fonts and the lazy chunk live next to the bundle, and it reads this
  // before it initialises — set it first or the canvas boots without Virgil.
  globalThis.EXCALIDRAW_ASSET_PATH = V + 'excalidraw/';
  libP = loadScript(V + 'react.production.min.js', () => globalThis.React)
    .then(() => loadScript(V + 'react-dom.production.min.js', () => globalThis.ReactDOM))
    .then(() => loadScript(V + 'excalidraw/excalidraw.production.min.js', () => globalThis.ExcalidrawLib));
  libP.catch(() => { libP = null; }); // a failed load must not poison later mounts
  return libP;
}

// What we write to disk. Ours rather than their serializeAsJSON because two
// browsers holding the SAME scene must produce the SAME bytes: the save is
// skipped when the text already matches disk, and that is what stops two open
// canvases from writing at each other forever. Everything volatile — scroll,
// zoom, selection, the generated scene name — is left out on purpose.
export function sceneText(elements, appState, files) {
  return JSON.stringify({
    type: 'excalidraw',
    version: 2,
    source: 'bridge-commander',
    elements: (elements || []).filter((e) => e && !e.isDeleted),
    appState: {
      gridSize: (appState && appState.gridSize) || null,
      viewBackgroundColor: (appState && appState.viewBackgroundColor) || '#ffffff',
    },
    files: files || {},
  }, null, 2);
}

// 0.17's SVG exporter builds its @font-face urls as
// <EXCALIDRAW_ASSET_PATH>/dist/excalidraw-assets/… — the npm package's layout,
// not the one we vendor. Left alone, every text shape in the exported picture
// 404s its font and falls back to something that is not handwriting.
export function fixFontUrls(svg) {
  return svg.replace(/\/+dist\/excalidraw-assets\//g, '/excalidraw-assets/');
}

// Read a .excalidraw file. A file we cannot read is NOT an empty drawing — it
// throws, the canvas refuses to mount, and nothing overwrites it.
export function parseScene(text) {
  const d = JSON.parse(text || '{}');
  if (!Array.isArray(d.elements)) throw new Error('not an Excalidraw drawing (no elements)');
  return { elements: d.elements, files: d.files || {}, appState: d.appState || {} };
}

// The merge, shape by shape. `theirs` is what is on disk now, `mine` is what is
// on the canvas (tombstones included — a delete is an element with a higher
// version, which is how Excalidraw's own multiplayer carries one), `baseIds`
// are the ids of the last disk state we saw, and `keep` are the ids the captain
// has his hands on right now.
//
//   both have it   → the higher `version` wins, EXCEPT anything in `keep`:
//                    what he has selected is his, whatever the disk says;
//   only theirs    → take it (they drew it);
//   only mine      → mine if it is new here or selected; otherwise it was in the
//                    base and is gone from theirs, which means they deleted it.
export function mergeElements(mine, theirs, baseIds, keep) {
  const byId = new Map((mine || []).map((e) => [e.id, e]));
  const out = (theirs || []).map((t) => {
    const m = byId.get(t.id);
    return m && (keep.has(t.id) || (m.version | 0) > (t.version | 0)) ? m : t;
  });
  const there = new Set((theirs || []).map((t) => t.id));
  for (const m of mine || []) {
    if (there.has(m.id)) continue;
    if (baseIds.has(m.id) && !keep.has(m.id)) continue; // they deleted it since we both read it
    out.push(m);
  }
  return out;
}

// Mount a canvas into `host` (emptied first). Same opts as mountFileEditor —
// name, content, onChange, actions — minus markdown, which a drawing has no use
// for. Returns { getValue, selection, replace, svg, destroy }.
export function mountDrawing(host, opts) {
  const o = opts || {};
  host.textContent = '';
  const bar = document.createElement('div');
  bar.className = 'fe-bar';
  const gap = document.createElement('span');
  gap.className = 'fe-gap';
  bar.appendChild(gap);
  const wrap = document.createElement('div');
  wrap.className = 'fe-draw';
  wrap.textContent = 'loading canvas…';
  host.append(bar, wrap);

  let lib = null, api = null, root = null, dead = false;
  let text = o.content || '';   // the last disk state we took
  let baseIds = new Set();      // the ids in it
  let pending = null, timer = null;

  const handle = {
    getValue: () => (api ? sceneText(api.getSceneElements(), api.getAppState(), api.getFiles()) : text),
    selection: () => null, // a drawing has no lines to quote
    replace: (t) => { pending = t; apply(); },
    svg: () => svgOf(),
    destroy: () => {
      dead = true;
      clearTimeout(timer);
      if (root) root.unmount();
      root = null; api = null;
      host.textContent = '';
    },
  };

  for (const a of o.actions || []) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = a.label;
    if (a.title) b.title = a.title;
    b.onclick = () => a.onClick(handle, b);
    bar.appendChild(b);
  }

  // The captain is in the middle of something. An incoming write is never
  // urgent enough to interrupt a stroke — hold it and look again in a moment.
  function busy() {
    const s = api.getAppState();
    return !!(s.draggingElement || s.resizingElement || s.editingElement || s.editingLinearElement ||
      s.selectionElement || s.multiElement || s.newElement || s.cursorButton === 'down');
  }

  function apply() {
    clearTimeout(timer);
    if (!api || pending == null || dead) return;
    if (busy()) { timer = setTimeout(apply, 300); return; }
    const t = pending;
    let d;
    try { d = parseScene(t); }
    catch (e) { pending = null; return; } // garbage on disk — ours stands, the save will say so
    pending = null;
    const st = api.getAppState();
    const sel = st.selectedElementIds || {};
    const keep = new Set(Object.keys(sel).filter((k) => sel[k]));
    if (st.editingElement) keep.add(st.editingElement.id);
    const theirs = lib.restoreElements(d.elements, null);
    // No appState in the update: scroll, zoom and selection stay exactly where
    // the captain left them. Only the shapes move.
    api.updateScene({ elements: mergeElements(api.getSceneElementsIncludingDeleted(), theirs, baseIds, keep) });
    const files = Object.values(d.files || {});
    if (files.length) api.addFiles(files); // their embedded images, or our next save drops them
    baseIds = new Set(theirs.map((e) => e.id));
    text = t;
  }

  function svgOf() {
    if (!api) return Promise.resolve('');
    const st = api.getAppState();
    return Promise.resolve(lib.exportToSvg({
      elements: api.getSceneElements(),
      files: api.getFiles(),
      appState: { exportBackground: true, exportWithDarkMode: false, viewBackgroundColor: st.viewBackgroundColor },
    })).then((el) => fixFontUrls(new XMLSerializer().serializeToString(el)));
  }

  loadLib().then((l) => {
    if (dead || !host.contains(wrap)) return; // destroyed while the vendor loaded
    lib = l;
    let d;
    try { d = parseScene(text); }
    catch (e) { wrap.textContent = '⚠ ' + e.message + ' — nothing was changed'; return; }
    baseIds = new Set(d.elements.map((e) => e.id));
    wrap.textContent = '';
    root = globalThis.ReactDOM.createRoot(wrap);
    // No JSX without a build step, so createElement by hand. That is the entire
    // adaptation cost of a React component in this codebase.
    root.render(globalThis.React.createElement(lib.Excalidraw, {
      theme: 'dark',
      initialData: {
        elements: d.elements,
        files: d.files,
        appState: { viewBackgroundColor: d.appState.viewBackgroundColor || '#ffffff' },
        scrollToContent: true,
      },
      UIOptions: { canvasActions: { loadScene: false } },
      excalidrawAPI: (a) => { api = a; apply(); }, // a write may have arrived while we booted
      onChange: () => { if (o.onChange) o.onChange(); },
    }));
  }).catch((e) => { wrap.textContent = '⚠ canvas failed to load — ' + e.message; });

  return handle;
}
