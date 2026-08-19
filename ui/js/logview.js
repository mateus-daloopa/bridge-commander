// logview.js — one firing's output, over the screen.
//
// A hook's log is a terminal's output: it is read in full or not at all, and it
// belongs nowhere near a list of firings — poured inline it buries every other
// firing under one blob and grows the column under his finger. So it is a
// modal, built the way the peek drawer and the load monitor are built: the same
// overlay, the same head, backdrop and Escape both close it.
//
// It reads nothing. The text is already in hand — whoever opens it read the
// firing from the trace — so there is no endpoint here and nothing to wait for.
import { ansiToHtml } from './ansi.js';

const overlay = document.getElementById('log-overlay');
const titleEl = document.getElementById('log-title');
const bodyEl = document.getElementById('log-body');

// openLog(title, output) — the title says which firing, so the modal is
// self-describing once the panel behind it is covered.
export function openLog(title, output) {
  titleEl.textContent = title;
  const text = String(output || '');
  if (text) {
    // The output of a hook is a terminal's output — ansiToHtml escapes the text
    // before it adds any markup, the same way the live pane reads a frame.
    bodyEl.innerHTML = ansiToHtml(text);
    bodyEl.classList.remove('log-empty');
  } else {
    // A firing that printed nothing is a fact about the firing, not an error.
    bodyEl.textContent = 'no output recorded';
    bodyEl.classList.add('log-empty');
  }
  overlay.hidden = false;
}
export function closeLog() { overlay.hidden = true; }
export function logOpen() { return !overlay.hidden; }

document.getElementById('log-close').onclick = closeLog;
overlay.onclick = (e) => { if (e.target === overlay) closeLog(); };
