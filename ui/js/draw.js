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

// What a REFUSED save becomes on a canvas. The server said the file moved and
// wrote nothing, and handed back what is there now — so this merges their copy
// with ours exactly the way an announced write is merged, and the result is
// what gets written instead, against the version the refusal came with.
//
// This is the only answer a drawing is allowed to give a 409. The alternative —
// pinning the version and letting the next automatic save through — is a clean
// overwrite of somebody's work that nobody chose, and there is no human in the
// loop to choose it: the canvas saves itself on a timer.
//
// null means the disk copy could not be read, and then the refusal STANDS.
export function resolveRefusal(mine, disk, baseIds, keep) {
  let d;
  try { d = parseScene(disk); }
  catch (e) { return null; }
  return sceneText(
    mergeElements(mine.elements, d.elements, baseIds, keep),
    mine.appState,
    Object.assign({}, d.files, mine.files),
  );
}

// What the debounce should do when it fires.
//   'write'   — the canvas has something the disk does not;
//   'wait'    — a save is already in flight, or an incoming write is PARKED
//               behind a gesture, waiting for the hand to come off the mouse.
//               Writing then would put the not-yet-merged canvas on disk at a
//               version the server has no reason to refuse: the other hand's
//               shape would be gone, with a 200 on it, and the refusal
//               machinery could not catch it because the write is not stale.
//               Waiting costs nothing — the merge lands the moment the gesture
//               ends, and its own change books the save;
//   'nothing' — the disk already has this scene.
export function saveDue(value, saved, saving, parked) {
  if (value === saved) return 'nothing';
  return saving || parked ? 'wait' : 'write';
}

// Has a HAND changed this scene? Excalidraw bumps an element's `version` on
// every real mutation, so the ids and versions are the whole answer. Scrolling,
// zooming, selecting and the re-serialisation that happens on mount are not
// changes and must not trigger a save — a read that writes is still a write.
export const sceneKey = (els) => (els || []).map((e) => e.id + ':' + e.version + (e.isDeleted ? 'x' : '')).join(',');

// Mount a canvas into `host` (emptied first). Same opts as mountFileEditor —
// name, content, onChange, actions — minus markdown, which a drawing has no use
// for. Returns { getValue, selection, replace, parked, resolve, svg, destroy }.
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
  let mark = null;              // its shapes, as ids+versions — what "unchanged" means
  let pending = null, timer = null;

  const handle = {
    getValue: () => (api ? sceneText(api.getSceneElements(), api.getAppState(), api.getFiles()) : text),
    selection: () => null, // a drawing has no lines to quote
    replace: (t) => { pending = t; apply(); },
    // Is somebody else's scene still waiting for the hand to come off the
    // mouse? Then this canvas is deliberately behind the disk, and nothing may
    // be written from it until the merge has run — see saveDue.
    parked: () => pending != null,
    resolve: (disk) => {
      if (!api) return null;
      const merged = resolveRefusal(mine(), disk, baseIds, keep());
      if (merged != null) { pending = disk; apply(); } // and the canvas takes theirs too, when the hand is free
      return merged;
    },
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
      s.selectionElement || s.multiElement || s.cursorButton === 'down');
  }
  // What he has his hands on right now — never moved, never deleted by anyone else.
  function keep() {
    const st = api.getAppState();
    const sel = st.selectedElementIds || {};
    const k = new Set(Object.keys(sel).filter((id) => sel[id]));
    if (st.editingElement) k.add(st.editingElement.id);
    return k;
  }
  // The scene as it stands here, in the shape resolveRefusal wants it.
  function mine() {
    return {
      elements: api.getSceneElementsIncludingDeleted(),
      appState: api.getAppState(),
      files: api.getFiles(),
    };
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
    const theirs = lib.restoreElements(d.elements, null);
    // No appState in the update: scroll, zoom and selection stay exactly where
    // the captain left them. Only the shapes move.
    api.updateScene({ elements: mergeElements(api.getSceneElementsIncludingDeleted(), theirs, baseIds, keep()) });
    const files = Object.values(d.files || {});
    if (files.length) api.addFiles(files); // their embedded images, or our next save drops them
    baseIds = new Set(theirs.map((e) => e.id));
    mark = sceneKey(theirs); // their shapes are the new "unchanged" — ours on top of them are a change
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
    mark = sceneKey(d.elements); // opening a drawing is a read — it must not turn into a write
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
      // Excalidraw reports its first render, every scroll and every selection as
      // a change. Only a change to the SHAPES is one — see sceneKey.
      onChange: (els) => {
        if (sceneKey(els) === mark) return;
        if (o.onChange) o.onChange();
      },
    }));
  }).catch((e) => { wrap.textContent = '⚠ canvas failed to load — ' + e.message; });

  return handle;
}
