// Generic file editor surface: content + filename in, edits and selection out.
// It knows nothing about cards, artifacts or the board — the host that mounts
// it owns all of that and passes callbacks (onChange / onSelection) plus its
// own toolbar buttons (actions). Today's host is the file screen showing a card
// artifact; tomorrow's could be the card description, and this file must not
// have to change for that.
//
// CodeMirror 5 is vendored (ui/vendor/codemirror, zero-CDN like the rest) and
// lazy-loaded on first mount exactly the way md.js lazy-loads highlight.js:
// whoever never opens an editor never pays for it. Language modes load on
// demand too, one file per language, resolved from the filename by CodeMirror's
// own mode/meta.js.
import { md, mdEnhance, loadScript } from './md.js';
import { fileLang } from './filectx.js';
import { uriDir } from './util.js';

const CM_BASE = '/ui/vendor/codemirror/';

function loadCss(href) {
  if (document.querySelector('link[data-cm="' + href + '"]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  l.dataset.cm = href;
  document.head.appendChild(l);
}

// codemirror.js first (meta.js and loadmode.js both need the global), then the
// two addons; modeURL is what autoLoadMode fetches language modes from.
let cmP = null;
function loadCM() {
  if (cmP) return cmP;
  loadCss(CM_BASE + 'lib/codemirror.css');
  cmP = loadScript(CM_BASE + 'lib/codemirror.js', () => globalThis.CodeMirror)
    .then((CM) => Promise.all([
      loadScript(CM_BASE + 'mode/meta.js', () => CM),
      loadScript(CM_BASE + 'addon/mode/loadmode.js', () => CM),
    ]).then(() => { CM.modeURL = CM_BASE + 'mode/%N/%N.js'; return CM; }));
  cmP.catch(() => { cmP = null; }); // a failed load must not poison later mounts
  return cmP;
}

function mkBtn(label, title) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  if (title) b.title = title;
  return b;
}

// Mount an editor into `host` (emptied first).
//   opts.name       filename — picks the syntax mode and labels a selection
//   opts.content    initial text
//   opts.markdown   render the preview as markdown (else: highlighted source)
//   opts.onChange() fires on every edit — the host owns persistence
//   opts.onSelection(sel|null)  sel = { text, lines, from, to }
//   opts.actions    [{ label, title, onClick(handle, btn) }] — host toolbar buttons
// Returns { getValue, selection, destroy }.
export function mountFileEditor(host, opts) {
  const o = opts || {};
  host.textContent = '';

  const bar = document.createElement('div');
  bar.className = 'fe-bar';
  const editBtn = mkBtn('✎ edit');
  const prevBtn = mkBtn('👁 preview');
  const gap = document.createElement('span');
  gap.className = 'fe-gap';
  bar.append(editBtn, prevBtn, gap);

  const edWrap = document.createElement('div');
  edWrap.className = 'fe-edit';
  edWrap.textContent = 'loading editor…';
  const prevWrap = document.createElement('div');
  prevWrap.className = 'fe-prev';
  prevWrap.hidden = true;
  host.append(bar, edWrap, prevWrap);

  let cm = null, sel = null, external = false;
  // Replace the buffer from OUTSIDE — the file changed under us and the host
  // decided we should follow. `changed` (0-based line numbers) get a marked
  // background, because "it was updated" is not information; "these lines" is.
  // The cursor and the scroll position stay where the reader left them: the
  // point of updating in place is that he does not lose his spot.
  function replace(text, changed) {
    if (!cm) { o.content = text; return; } // vendor still loading — it mounts with this
    const scroll = cm.getScrollInfo();
    const cur = cm.getCursor();
    cm.eachLine((h) => cm.removeLineClass(h, 'background', 'fe-chg')); // the previous round's marks
    external = true; // this is not the captain typing — onChange must not read it as an edit
    try { cm.setValue(text); } finally { external = false; }
    for (const n of changed || []) {
      if (n >= 0 && n < cm.lineCount()) cm.addLineClass(n, 'background', 'fe-chg');
    }
    cm.setCursor({ line: Math.min(cur.line, cm.lastLine()), ch: cur.ch });
    cm.scrollTo(scroll.left, scroll.top);
    if (!prevWrap.hidden) showPreview(true); // the preview is showing — re-render it
  }
  const handle = {
    getValue: () => (cm ? cm.getValue() : o.content || ''),
    selection: () => sel,
    replace,
    destroy: () => { cm = null; sel = null; host.textContent = ''; },
  };

  for (const a of o.actions || []) {
    const b = mkBtn(a.label, a.title);
    b.onclick = () => a.onClick(handle, b);
    bar.appendChild(b);
  }

  function emitSel() {
    const has = cm && cm.somethingSelected();
    if (!has) { sel = null; if (o.onSelection) o.onSelection(null); return; }
    const from = cm.getCursor('from'), to = cm.getCursor('to');
    // human line numbers, 1-based; a selection ending at column 0 stops on the
    // previous line as far as the reader is concerned
    const last = to.ch === 0 && to.line > from.line ? to.line : to.line + 1;
    sel = {
      text: cm.getSelection(),
      from, to,
      lines: last > from.line + 1 ? (from.line + 1) + '–' + last : String(from.line + 1),
    };
    if (o.onSelection) o.onSelection(sel);
  }

  function showPreview(on) {
    edWrap.hidden = on;
    prevWrap.hidden = !on;
    editBtn.classList.toggle('on', !on);
    prevBtn.classList.toggle('on', on);
    if (!on) { if (cm) { cm.refresh(); cm.focus(); } return; }
    const text = handle.getValue();
    prevWrap.className = 'fe-prev md';
    if (o.markdown) {
      prevWrap.innerHTML = md(text, uriDir(o.key));
    } else {
      // non-markdown previews as one highlighted block — mdEnhance lazy-loads
      // the same highlight.js every code fence on the board already uses
      prevWrap.textContent = '';
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.className = 'language-' + fileLang(o.name);
      code.textContent = text;
      pre.appendChild(code);
      prevWrap.appendChild(pre);
    }
    mdEnhance(prevWrap);
  }
  editBtn.onclick = () => showPreview(false);
  prevBtn.onclick = () => showPreview(true);
  editBtn.classList.add('on');

  loadCM().then((CM) => {
    if (!host.contains(edWrap)) return; // destroyed while the vendor loaded
    edWrap.textContent = '';
    cm = CM(edWrap, {
      value: o.content || '',
      lineNumbers: true,
      lineWrapping: true,
      theme: 'bc',
      viewportMargin: 30,
    });
    const info = o.markdown ? CM.findModeByName('markdown') : CM.findModeByFileName(o.name || '');
    if (info) {
      cm.setOption('mode', info.mime || info.mode);
      CM.autoLoadMode(cm, info.mode); // fetches ui/vendor/codemirror/mode/<mode>/<mode>.js
    }
    cm.on('cursorActivity', emitSel);
    cm.on('change', () => { if (o.onChange && !external) o.onChange(); });
    cm.focus();
  }).catch((e) => { edWrap.textContent = '⚠ editor failed to load — ' + e.message; });

  return handle;
}
