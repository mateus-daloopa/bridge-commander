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

// spec: { key, name, content, markdown, crumb: { label, title, onClick }, onChange(text) }
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
  open = null;
  refreshQuote(); // the chip goes with the screen
}

function build() {
  el.textContent = '';
  const head = document.createElement('div');
  head.className = 'fp-head';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'fp-back';
  back.textContent = '⟵';
  back.title = 'back to the board';
  back.onclick = closeFile;
  head.appendChild(back);
  // breadcrumb: where this file came from › the file itself
  if (open.crumb) {
    const from = document.createElement('button');
    from.type = 'button';
    from.className = 'fp-from';
    from.textContent = open.crumb.label;
    from.title = open.crumb.title || '';
    from.onclick = open.crumb.onClick;
    const sep = document.createElement('span');
    sep.className = 'fp-sep';
    sep.textContent = '›';
    head.append(from, sep);
  }
  const nm = document.createElement('span');
  nm.className = 'fp-file';
  nm.textContent = open.name;
  head.appendChild(nm);
  const body = document.createElement('div');
  body.className = 'fp-body';
  el.append(head, body);

  handle = mountFileEditor(body, {
    name: open.name,
    markdown: open.markdown,
    content: open.content,
    onChange: () => { if (open.onChange) open.onChange(handle.getValue()); },
    onSelection: () => refreshQuote(), // the chip follows the cursor
    actions: [{
      label: '💾 save',
      title: 'prototype: the draft is kept in this browser only',
      onClick: (h, btn) => {
        if (open.onChange) open.onChange(h.getValue());
        btn.textContent = '✓ saved (fake)';
        setTimeout(() => { btn.textContent = '💾 save'; }, 1600);
      },
    }],
  });
}
