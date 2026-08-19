// The ⚡ screen's hooks column: the workspace's own executable scripts, what
// fires each one, and how the last run ended.
//
// A hook is a script somebody wrote. It has a kind, a last exit code, and — when
// it went red — output worth reading. So it is a card with those facts under
// captions rather than a line of 11px grey:
//
//   gh-watch                                                    ▶  ✎
//   FIRED BY            LAST RUN
//   ⚡ gh-watch          ran 4m ago · exit 0
//
// FIRED BY is the half of the story the two config tabs could not tell: a
// lifecycle hook names its event, a named hook names the SCHEDULES that fire it
// (clicking one jumps to that schedule beside this column), and one nothing
// fires says so. Red sorts to the top, because a failed run is why this screen
// gets opened.
//
// ▶ posts to the same door `bc-axi hook run` posts to — one code path, three
// callers. ✎ opens the file on the file screen, the same editor a playbook opens
// in, which is where "he asks a lieutenant to help build one" happens: a file on
// a screen he can point at.
//
// One rule governs every ▶ here: a refusal is visible. Enabled-and-works and
// disabled-with-a-reason are both fine; enabled-and-silently-refuses is the
// worst of the three, because it teaches him the screen is broken and he is
// right. So the ▶ on a lifecycle card is disabled WITH a title saying why, and
// the ▶ on a hook someone else is already running is not disabled at all — the
// server locks per name, so the screen does too, and a press it would refuse
// never looks live. Same principle, opposite answer.
//
// Deliberately absent: run detail (the output tail lives in hookruns.jsonl and
// is read with `bc-axi hook runs`, or through the schedule that fired it) and a
// create button (naming a file, making it executable and typing bash into a text
// box on a phone is the worst way to do all three).
import { api } from './api.js';
import { ago } from './util.js';
import { openArtifactFile } from './detail.js';
import { schedulesForHook } from './scmanager.js';

const listEl = document.getElementById('hk-list');
const countEl = document.getElementById('hk-count');
const noteEl = document.getElementById('hk-note');
const dirEl = document.getElementById('hk-dir');

let items = null; // [{name, event, file, last, running}] — last answer from the server
let dir = '';
let loading = false;
let stale = false; // a render arrived while a read was in flight
const running = new Set(); // hook names whose ▶ was pressed HERE — state, not a mutated button
let focus = ''; // a hook the schedules column sent us to — marked until the mode is re-entered

// A hook card names the schedules that fire it, and each name is a way there.
// The schedules column owns that focus, so this module is handed the action
// rather than reaching for it — the shape filepane's onModeSwitch uses.
let openScheduleFn = null;
export function onOpenSchedule(fn) { openScheduleFn = fn; }

// What the masthead counts. `bad` is a hook whose last run did not come back
// clean — the reason this screen gets opened.
export function hookCounts() {
  const list = items || [];
  return { total: list.length, bad: list.filter(isBad).length };
}
function isBad(h) { return !!(h.last && !h.last.ok); }

// Same contract as every other list on the board: `reload` is what ENTERING the
// mode passes. Every render ASKS, though, not just the entering one — a hook run
// from the CLI, or a lifecycle hook firing, changes what a card says about its
// last run, and the board event that brought us here is the only nudge this
// screen gets. That is also why there is no polling: nothing runs at all while
// another mode is up.
export async function renderHooks(reload) {
  if (reload) { noteEl.textContent = ''; focus = ''; } // entering is a fresh look, not last visit's answer
  if (loading) { stale = true; return; } // the read in flight answers for both askers
  loading = true;
  try {
    do {
      stale = false;
      const r = await api.hooks();
      items = r.hooks || [];
      dir = r.dir || '';
    } while (stale);
  } catch (e) {
    // A read that failed says so where a press says so — blanking a list that is
    // still true on screen would be the worse lie.
    if (items) noteEl.textContent = '⚠ ' + e.message;
    else listEl.textContent = '⚠ ' + e.message;
    return;
  } finally { loading = false; }
  paint();
}

// The other half of a schedule's hook link: mark the hook it named, so "which
// one is nightly-digest firing" is answered by looking. The mark lasts until the
// mode is entered fresh, because one that vanished on the next board event would
// be gone before he looked up.
export function focusHook(name) {
  focus = name;
  renderHooks();
}

function paint() {
  if (!items) return;
  listEl.textContent = '';
  let marked = null;
  for (const h of ordered()) {
    const el = row(h);
    if (h.name === focus) marked = el;
    listEl.appendChild(el);
  }
  if (!items.length) {
    const el = document.createElement('div');
    el.className = 'au-empty';
    el.textContent = 'no hooks — nothing executable in the hooks directory yet';
    listEl.append(el);
  }
  countEl.textContent = items.length ? countText() : '';
  // A hook a schedule names and this list does not have is the deleted-hook
  // case, and the schedule's own row already says so in full — so the note says
  // it here too rather than leaving a jump that silently did nothing.
  if (focus) {
    if (marked) marked.scrollIntoView({ block: 'nearest' });
    else noteEl.textContent = 'no hook "' + focus + '" here — the schedule that fires it says so on its card';
  }
  dirEl.textContent = dir + ' — a file here is a named hook; a directory is a lifecycle event';
}

// Failed first, everything else in the order the server listed it — a red card
// below the fold is a red card he does not see. Stable within a rank, so
// nothing shuffles under a finger while everything is green.
function ordered() {
  return items.map((h, i) => [h, i]).sort((a, b) => (isBad(b[0]) - isBad(a[0])) || a[1] - b[1])
    .map(([h]) => h);
}

function countText() {
  const bad = items.filter(isBad).length;
  return items.length + ' total' + (bad ? ' · ' + bad + ' failing' : '');
}

function row(h) {
  const el = document.createElement('div');
  const busy = running.has(h.name);
  el.className = 'hk-row' + (isBad(h) ? ' au-bad' : '') + (h.name === focus ? ' au-focus' : '');
  el.append(head(h, busy), facts(h, busy));
  return el;
}

function head(h, busy) {
  const el = document.createElement('div');
  el.className = 'hk-head';
  const nm = document.createElement('span');
  nm.className = 'hk-name';
  nm.textContent = h.name;
  nm.title = h.file;
  el.append(nm, actions(h, busy));
  return el;
}

// How the last run ended, in the words the CLI uses for it.
function outcome(r) {
  if (!r) return 'never ran';
  const when = ago(r.started); // 'now' | '4m' | '2h' | '3d'
  return 'ran ' + (when === 'now' ? 'just now' : when + ' ago') + ' · '
    + (r.timedOut ? 'timed out' : r.error ? 'never started'
      : r.code === null ? 'killed' : 'exit ' + r.code);
}

// The two facts a hook IS: what fires it, and how the last run ended.
//
// `busy` is a press this screen is still waiting on; h.running is the server's
// own answer, which is how a run started from the CLI reads as running here too.
function facts(h, busy) {
  const el = document.createElement('div');
  el.className = 'au-stats';
  el.append(firedBy(h), lastRun(h, busy));
  return el;
}

// The relationship the two config tabs made him infer. A lifecycle hook is
// fired by its event; a named one by whichever schedules point at it, and each
// of those is a button that lands on that schedule.
function firedBy(h) {
  const el = document.createElement('div');
  el.className = 'au-stat';
  const cap = document.createElement('div');
  cap.className = 'au-cap';
  cap.textContent = 'fired by';
  const v = document.createElement('div');
  v.className = 'au-val';
  el.append(cap, v);
  if (h.event) {
    const ev = document.createElement('span');
    ev.className = 'hk-event';
    ev.textContent = h.event;
    ev.title = 'the card lifecycle event that fires this one';
    v.append(ev);
    return el;
  }
  const names = schedulesForHook(h.name);
  if (!names.length) {
    v.classList.add('au-off');
    v.textContent = 'nothing — ▶ only';
    return el;
  }
  for (const n of names) v.append(scheduleLink(n));
  return el;
}

function scheduleLink(name) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'hk-sched';
  b.textContent = '⚡ ' + name;
  b.title = 'the schedule that fires this — show it beside this column';
  b.onclick = () => { if (openScheduleFn) openScheduleFn(name); };
  return b;
}

function lastRun(h, busy) {
  const el = document.createElement('div');
  el.className = 'au-stat';
  const cap = document.createElement('div');
  cap.className = 'au-cap';
  cap.textContent = 'last run';
  const live = busy || !!h.running;
  const v = document.createElement('div');
  v.className = 'au-val ' + (live ? 'hk-running' : !h.last ? 'hk-never' : h.last.ok ? 'hk-ok' : 'hk-bad');
  v.textContent = live ? 'running now' : outcome(h.last);
  el.append(cap, v);
  return el;
}

function actions(h, busy) {
  const el = document.createElement('span');
  el.className = 'hk-acts';
  const run = action(busy ? '…' : '▶', 'run it now — the same door bc-axi hook run posts to', () => runNow(h));
  // A lifecycle hook is fired by the event that owns it. Running one by hand
  // would hand it an empty BC_CARD and a card-shaped script would do the wrong
  // thing quietly, so the button says why instead of pretending.
  if (h.event) {
    run.disabled = true;
    run.title = h.event + ' fires this one — running it by hand would hand it no card';
  } else if (busy) run.disabled = true;
  el.append(run, action('✎', 'edit — ' + h.file, () => edit(h)));
  return el;
}

function action(label, title, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'au-act';
  b.textContent = label;
  b.title = title;
  b.onclick = onClick;
  return b;
}

// The run says what it did just under the list: the button is where he pressed,
// so it is where the answer belongs. A refusal (409 — already in flight) and a
// non-zero exit both read here; the output tail is `bc-axi hook runs`.
//
// The press is held HERE and not on the button, because a board event repaints
// every row mid-run: a button that came back enabled under his thumb would be
// the second press the server then has to refuse, and the '…' would vanish with
// nothing left saying anything is happening.
//
// It is a Set keyed per name, not one name, because the server's lock is per
// workspace + name: two hooks running at once is what it permits, and a
// five-minute poll still going while he presses another row is the ordinary
// case. One concurrency rule in this feature, not two.
async function runNow(h) {
  if (running.has(h.name)) return;
  running.add(h.name);
  paint();
  let note;
  try {
    const r = await api.runHook(h.name);
    note = r.run.timedOut ? 'timed out' : r.run.error ? 'never started'
      : r.run.code === null ? 'killed' : 'exit ' + r.run.code;
  } catch (e) {
    note = e.message;
  }
  running.delete(h.name);
  await renderHooks();
  noteEl.textContent = h.name + ': ' + note;
}

// A hook is a file, so editing it is the file screen — the same 💾, the same
// version check, the same 409 as a playbook or a card artifact.
async function edit(h) {
  try {
    await openArtifactFile('file://' + h.file, h.name);
  } catch (e) {
    noteEl.textContent = '⚠ cannot open ' + h.name + ' — ' + e.message;
  }
}
