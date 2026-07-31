// The file screen: the FOURTH mode of the main area (board | table | archive |
// file), so editing happens WHERE the board was, with the chat still at its
// side — not in a popup over it. A popup is something you open and close in ten
// seconds; editing is where you stay.
//
// It is the host of the generic editor (fileedit.js) and knows nothing about
// artifacts either: it takes content, a filename, a breadcrumb and callbacks.
// Whoever opens it (detail.js today) is the one that knows what a card and an
// artifact are.
//
// While this screen is up, EVERY chat message carries the file context — which
// file, which lines, which text (chat.js pulls it through fileQuote). The
// message still lives in the card's thread: the context travels with it, it
// doesn't get a home of its own.
import { S } from './state.js';
import { mountFileEditor } from './fileedit.js';
import { mountDrawing } from './draw.js';
import { refreshQuote } from './chat.js';
import { changedLines } from './util.js';

const el = document.getElementById('filepane');

let open = null;    // { key, name, markdown, backMode, onChange } while the screen is up
let handle = null;  // the mounted editor
let modeSwitch = () => {}; // set by main.js — flipping the main area's mode is its job
export function onModeSwitch(fn) { modeSwitch = fn; }

export function fileOpen() { return !!open; }
export function fileName() { return open ? open.name : ''; }
// Which file is up (the host's own key — a uri, for today's host), and whether
// there is typing in it that is not on disk yet. `open.saved` is the text this
// screen believes is on disk: what the host handed it as `saved`, moved forward
// by every save that landed and every outside update it took. It is NOT the
// text the editor mounted with — a restored draft is unsaved typing from an
// earlier visit, and it has to keep counting as unsaved.
export function fileKey() { return open ? open.key : ''; }
export function fileDirty() { return !!(open && handle && handle.getValue() !== open.saved); }
// Does what is open merge an outside write instead of choosing between it and
// the captain's? A drawing does — shape by shape, which is why it can take one
// while he is still drawing. Text cannot, so text still asks.
export function fileMerges() { return !!(open && open.draw); }
// A write was REFUSED and the host handed back what is on disk. On a screen
// that merges, that is not a dead end: this returns the text to write instead —
// theirs and his, merged — and the canvas takes theirs too. null when it cannot
// be merged, and then the refusal stands, which is the point of it.
export function fileResolve(disk) {
  if (!open || !handle || !handle.resolve) return null;
  return handle.resolve(disk);
}
// The file changed underneath us and the host decided we follow: swap the text
// in place, mark the lines that moved, and say so in the note. No reload, no
// button — the captain keeps his cursor and sees what the other hand did.
export function fileUpdate(text, note) {
  if (!open) return;
  if (open.draw) {
    // A canvas has no lines to mark: the shapes are merged in, and what he has
    // his hands on is left alone.
    open.saved = text;
    if (handle) handle.replace(text);
    return say((note || 'updated on disk') + ' — merged into the canvas', 'live');
  }
  const changed = changedLines(open.saved, text);
  open.saved = text;
  if (handle) handle.replace(text, changed);
  say((note || 'updated on disk') + ' — ' + changed.length + (changed.length === 1 ? ' line' : ' lines') + ' marked', 'live');
}
// Say something on the note line, optionally with the choices it demands:
// actions = [{ label, onClick }]. Clicking one clears the note.
export function fileNotice(text, kind, actions) { say(text, kind, actions); }
// What rides along with the next chat message: the file always, plus the
// highlighted lines when there is a selection.
export function fileQuote() {
  if (!open) return null;
  const s = handle && handle.selection();
  return s
    ? { name: open.name, lines: s.lines, text: s.text }
    : { name: open.name };
}

// spec: { key, name, content, saved, markdown, crumb: { label, title, onClick },
//         onChange(text), onSave(text) -> Promise<string> (the line to show) }
// `content` is what the editor mounts with (a restored draft, when there is
// one); `saved` is what is on disk (defaults to content).
export function openFile(spec) {
  const back = S.boardMode === 'file' ? (open && open.backMode) || 'board' : S.boardMode;
  drop();
  open = Object.assign({}, spec, { backMode: back });
  if (open.saved == null) open.saved = open.content;
  build();
  S.view = 'board'; // mobile: the file screen lives in the board tab (renamed to it)
  modeSwitch('file'); // renders
  refreshQuote();
}
// Leave the screen and put the main area back where it was.
export function closeFile() {
  if (!open) return;
  const back = open.backMode;
  drop();
  modeSwitch(back);
}
// Forget the screen WITHOUT switching modes — for main.js, when the captain
// picks another mode from the switcher instead of using the ⟵.
export function forgetFile() { if (open) drop(); }

function drop() {
  clearTimeout(autoTimer);
  if (handle) { handle.destroy(); handle = null; }
  el.textContent = '';
  noteEl = null;
  open = null;
  refreshQuote(); // the chip goes with the screen
}

function build() {
  el.textContent = '';
  const head = document.createElement('div');
  head.className = 'fs-head';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'fs-back';
  back.textContent = '⟵';
  back.title = 'back to the board';
  back.onclick = closeFile;
  head.appendChild(back);
  // breadcrumb: where this file came from › the file itself
  if (open.crumb) {
    const from = document.createElement('button');
    from.type = 'button';
    from.className = 'fs-from';
    from.textContent = open.crumb.label;
    from.title = open.crumb.title || '';
    from.onclick = open.crumb.onClick;
    const sep = document.createElement('span');
    sep.className = 'fs-sep';
    sep.textContent = '›';
    head.append(from, sep);
  }
  const nm = document.createElement('span');
  nm.className = 'fs-file';
  nm.textContent = open.name;
  head.appendChild(nm);
  // Where saving reports what happened, in words, above the text it refers to.
  // A refused write (the file moved under us) must never be a toast that fades
  // while the captain is looking somewhere else.
  const note = document.createElement('div');
  note.className = 'fs-note';
  note.hidden = true;
  const body = document.createElement('div');
  body.className = 'fs-body';
  el.append(head, note, body);
  noteEl = note;

  handle = (open.draw ? mountDrawing : mountFileEditor)(body, {
    name: open.name,
    markdown: open.markdown,
    content: open.content,
    onChange: () => {
      if (!handle) return; // the canvas reports its first render before we hold it
      if (open.onChange) open.onChange(handle.getValue());
      if (open.draw) autosave(); // nobody hits ⌘S per stroke — the canvas saves itself
    },
    onSelection: () => refreshQuote(), // the chip follows the cursor
    actions: [{
      label: '💾 save',
      title: 'write this file (⌘S / Ctrl+S)',
      onClick: save,
    }],
  });
}

// Nobody saves a drawing by hand every few seconds, so the canvas saves itself
// — on a debounce, not per stroke, and never when the text already matches what
// is on disk (which is what keeps two open canvases from writing at each other
// after a merge).
let autoTimer = null;
function autosave() {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => {
    if (!open || !handle || handle.getValue() === open.saved) return;
    if (saving) return autosave(); // one already in flight — come back after it
    const btn = el.querySelector('.fe-bar button[title^="write this file"]');
    if (btn) save(handle, btn);
  }, 1500);
}

// Save through the host's writer, saying what happened either way. The screen
// knows nothing about what it is saving to — it prints the line it is handed.
let saving = false;
let noteEl = null;
function say(text, kind, actions) {
  if (!noteEl) return;
  noteEl.hidden = !text;
  noteEl.textContent = '';
  noteEl.className = 'fs-note' + (kind ? ' fs-note-' + kind : '');
  if (!text) return;
  const line = document.createElement('span');
  line.textContent = text;
  noteEl.appendChild(line);
  for (const a of actions || []) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fs-note-act';
    b.textContent = a.label;
    if (a.title) b.title = a.title;
    b.onclick = () => { say(''); a.onClick(); };
    noteEl.appendChild(b);
  }
}
function save(h, btn) {
  if (saving || !open || !open.onSave) return;
  saving = true;
  const text = h.getValue();
  const was = btn.textContent;
  btn.textContent = '💾 saving…';
  btn.disabled = true;
  // A drawing also hands over the means to take its own picture — called by the
  // host once it knows what actually landed (today: a .svg beside the file, so
  // the drawing is visible where mermaid already is).
  //
  // The host may answer with a line, or with { note, saved } when what landed is
  // not what we handed it — a refused save that resolved itself into a merge
  // wrote something else, and this screen has to believe the disk over its own
  // snapshot or it will save the same stale text again.
  Promise.resolve(open.onSave(text, h.svg || null)).then(
    (r) => {
      const msg = r && r.note !== undefined ? r.note : r;
      if (open) open.saved = r && r.saved != null ? r.saved : text;
      say(msg || 'saved', 'ok');
    },
    (e) => { say('⚠ ' + (e && e.message ? e.message : 'save failed'), 'err'); },
  ).then(() => {
    saving = false;
    btn.disabled = false;
    btn.textContent = was;
  });
}
// ⌘S / Ctrl+S saves the file screen — the reflex every editor has trained, and
// on this screen the browser's own "save page" is never what is meant.
document.addEventListener('keydown', (e) => {
  if (!open || !(e.metaKey || e.ctrlKey) || e.key !== 's') return;
  e.preventDefault();
  const btn = el.querySelector('.fe-bar button[title^="write this file"]');
  if (handle && btn) save(handle, btn);
});
