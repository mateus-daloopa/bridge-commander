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
import { refreshQuote } from './chat.js';

const el = document.getElementById('filepane');

let open = null;    // { key, name, markdown, backMode, onChange } while the screen is up
let handle = null;  // the mounted editor
let modeSwitch = () => {}; // set by main.js — flipping the main area's mode is its job
export function onModeSwitch(fn) { modeSwitch = fn; }

export function fileOpen() { return !!open; }
export function fileName() { return open ? open.name : ''; }
// What rides along with the next chat message: the file always, plus the
// highlighted lines when there is a selection.
export function fileQuote() {
  if (!open) return null;
  const s = handle && handle.selection();
  return s
    ? { name: open.name, lines: s.lines, text: s.text }
    : { name: open.name };
}

// spec: { key, name, content, markdown, crumb: { label, title, onClick },
//         onChange(text), onSave(text) -> Promise<string> (the line to show) }
export function openFile(spec) {
  const back = S.boardMode === 'file' ? (open && open.backMode) || 'board' : S.boardMode;
  drop();
  open = Object.assign({}, spec, { backMode: back });
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

  handle = mountFileEditor(body, {
    name: open.name,
    markdown: open.markdown,
    content: open.content,
    onChange: () => { if (open.onChange) open.onChange(handle.getValue()); },
    onSelection: () => refreshQuote(), // the chip follows the cursor
    actions: [{
      label: '💾 save',
      title: 'write this file (⌘S / Ctrl+S)',
      onClick: save,
    }],
  });
}

// Save through the host's writer, saying what happened either way. The screen
// knows nothing about what it is saving to — it prints the line it is handed.
let saving = false;
let noteEl = null;
function say(text, kind) {
  if (!noteEl) return;
  noteEl.hidden = !text;
  noteEl.textContent = text || '';
  noteEl.className = 'fs-note' + (kind ? ' fs-note-' + kind : '');
}
function save(h, btn) {
  if (saving || !open || !open.onSave) return;
  saving = true;
  const was = btn.textContent;
  btn.textContent = '💾 saving…';
  btn.disabled = true;
  Promise.resolve(open.onSave(h.getValue())).then(
    (msg) => { say(msg || 'saved', 'ok'); },
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
