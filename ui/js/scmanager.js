// The ⚡ screen's schedules column: the board's own clock, beside the hooks it
// fires.
//
// MNC-25 shipped the clock and gave it no screen; MNC-84 gave it a row of grey
// text on a config tab. A schedule is a LIVE thing — a countdown to the next
// fire, a last run that passed or failed, and an owner a failure wakes — so it
// is a card with those four facts under captions, at a size he can read from
// across the room:
//
//   ▸ gh-watch   → gh-watch                                    ‖  ✕
//     WHEN         NEXT FIRE      LAST FIRE            OWNER
//     every 5m     in 3m          fired 2m ago exit 0  tonylampada
//
// The `problem` is why this column is worth having at all. A schedule whose
// hook was deleted, or whose `when` stopped parsing, fires nothing forever and
// looks exactly like one that is working — that is the silent failure the clock
// exists to end, so a broken card is red, carries the server's whole sentence,
// and SORTS TO THE TOP. Red is the reason the screen gets opened; it must not
// be below the fold.
//
// Same rule for the add form's refusals: the server names the offending text
// ("bad schedule expression \"*/5 * * *\": a cron expression has 5 fields…"),
// and that message is shown VERBATIM. Replacing it with "invalid" would throw
// away the only part of it that helps.
//
// No endpoint was added for any of this. Every read and every write here is a
// door `bc-axi schedule …` already posts to, including the firings: they come
// off hookruns.jsonl, filtered to this schedule's trigger server-side, so the
// screen and the CLI read one truth.
import { api } from './api.js';
import { hhmm } from './util.js';
import { openAuxDetail, auxDetailKey, repaintAuxDetail, closeDetail } from './detail.js';
import { openLog } from './logview.js';

const listEl = document.getElementById('sc-list');
const countEl = document.getElementById('sc-count');
const noteEl = document.getElementById('sc-note');
const addEl = document.getElementById('sc-add');
const formEl = document.getElementById('sc-form');
const nameEl = document.getElementById('sc-name');
const hookEl = document.getElementById('sc-hook');
const whenEl = document.getElementById('sc-when');
const ownerEl = document.getElementById('sc-owner');
const overlapEl = document.getElementById('sc-overlap');
const catchupEl = document.getElementById('sc-catchup');

// The one place the note is written, so a refusal always reads like one: every
// failure here leads with a ⚠, and that is what colours it. A refusal in the
// same faint grey as "added" is how a screen teaches him not to read it.
function say(text) {
  noteEl.textContent = text;
  noteEl.classList.toggle('sc-warn', text.startsWith('⚠'));
}

let items = null; // the last GET /api/schedules answer
let loading = false;
let stale = false; // a render arrived while a read was in flight
// The schedule showing in the detail panel, and its firings as last read. One
// at a time, because the panel holds one subject at a time.
let openName = '';
const runs = new Map(); // name -> its firings, as last read
const busy = new Set(); // names with a press still in flight — state, not a mutated button

// The hook name jumps to that hook's row on the hooks tab. main.js owns the tab
// switching, so it hands the action down here rather than this module reaching
// up for it — the same shape filepane uses for onModeSwitch.
let openHookFn = null;
export function onOpenHook(fn) { openHookFn = fn; }

// A card the hooks column sent us to — marked until the mode is entered fresh,
// because a mark that vanished on the next board event would be gone before he
// looked up.
let focus = '';
export function focusSchedule(name) {
  focus = name;
  renderSchedules();
}

// What the masthead counts. `bad` is the number this screen exists for: a
// schedule that fires nothing, or whose last firing did not come back clean. A
// skip is neither — it is the overlap policy doing its job.
export function scheduleCounts() {
  const list = items || [];
  return { total: list.length, bad: list.filter(isBad).length };
}
function isBad(s) { return !!s.problem || !!(s.last && !s.last.skipped && !s.last.ok); }

// The other half of the one-story rule: a hook card says which schedules fire
// it, and reads that off the answer this module already holds.
export function schedulesForHook(hook) {
  return (items || []).filter((s) => s.hook === hook).map((s) => s.name);
}

// Same contract as its neighbours: `reload` is what the tab passes on the way
// in. Every render ASKS, though, not just the entering one — a schedule fires,
// is paused from the CLI, or has its hook deleted out from under it, and the
// board event that brought us here is the only nudge this tab gets. Which is
// also why there is no polling: nothing runs while another tab is up.
export async function renderSchedules(reload) {
  if (reload) { say(''); focus = ''; } // entering is a fresh look, not last visit's answer
  if (loading) { stale = true; return; } // the read in flight answers for both askers
  loading = true;
  try {
    do {
      stale = false;
      items = (await api.schedules()).schedules || [];
      // Only the schedule in the panel is re-read — its firings must not go on
      // saying a firing ago is the newest one, and a panel nobody opened costs
      // nothing.
      if (openName) {
        try { runs.set(openName, (await api.schedule(openName)).runs || []); }
        catch (e) { runs.delete(openName); shutPanel(); }
      }
    } while (stale);
  } catch (e) {
    // A read that failed says so where a press says so — blanking a list that is
    // still true on screen would be the worse lie.
    if (items) say('⚠ ' + e.message);
    else listEl.textContent = '⚠ ' + e.message;
    return;
  } finally { loading = false; }
  if (reload) loadPickers();
  // A schedule removed from under an open panel takes the panel with it — the
  // ✕ on this screen and one typed at a terminal are the same removal.
  if (openName && !items.some((s) => s.name === openName)) shutPanel();
  paint();
  repaintAuxDetail(); // the firings just re-read are what the panel is showing
}

function paint() {
  if (!items) return;
  listEl.textContent = '';
  let marked = null;
  for (const s of ordered()) {
    const el = row(s);
    if (s.name === focus) marked = el;
    listEl.appendChild(el);
  }
  if (!items.length) listEl.append(empty('no schedules — the board keeps no clock yet'));
  countEl.textContent = items.length ? countText(items) : '';
  if (marked) marked.scrollIntoView({ block: 'nearest' });
}

// Broken first, paused next, working last — a red card below the fold is a red
// card he does not see, and this screen is opened BECAUSE something went red.
// Stable within a rank, so the server's order survives and nothing shuffles
// under a finger while everything is green.
function ordered() {
  const rank = (s) => (isBad(s) ? 0 : s.paused ? 1 : 2);
  return items.map((s, i) => [s, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
    .map(([s]) => s);
}

function countText(list) {
  const bad = list.filter(isBad).length;
  const off = list.filter((s) => !isBad(s) && s.paused).length;
  const parts = [list.length + ' total'];
  if (bad) parts.push(bad + ' failing');
  if (off) parts.push(off + ' paused');
  return parts.join(' · ');
}

function empty(text) {
  const el = document.createElement('div');
  el.className = 'au-empty';
  el.textContent = text;
  return el;
}

function row(s) {
  const el = document.createElement('div');
  // One class for "this one is red", whichever way it went red: a `problem`
  // (fires nothing, forever) and a last firing that came back non-zero are the
  // same news to him, and a rail that only lit for one of them would teach him
  // the other is fine.
  el.className = 'sc-row' + (isBad(s) ? ' au-bad' : '') + (s.paused ? ' sc-off' : '')
    + (s.name === focus ? ' au-focus' : '') + (s.name === openName ? ' au-open' : '');
  el.append(head(s), stats(s));
  // In full and above the fold: a problem is the reason to look at this tab, so
  // it is not a title attribute and it is not truncated.
  if (s.problem) el.append(problem(s));
  return el;
}

function head(s) {
  const el = document.createElement('div');
  el.className = 'sc-head';
  el.title = s.name === openName ? 'close the firings panel' : 'the recent firings, in the panel';
  el.onclick = () => toggle(s);
  const caret = document.createElement('span');
  caret.className = 'au-caret';
  // ▸ / ▾ still means "this one is showing" — it just shows to the side now, so
  // pressing a card never grows the column under his finger.
  caret.textContent = s.name === openName ? '▾' : '▸';
  const nm = document.createElement('span');
  nm.className = 'sc-name';
  nm.textContent = s.name;
  el.append(caret, nm, hookLink(s));
  // Paused is a state, not a shade: a greyed row and a row on a dim screen look
  // the same, and "why did this stop firing" is the question the tab answers.
  if (s.paused) {
    const chip = document.createElement('span');
    chip.className = 'sc-chip';
    chip.textContent = 'PAUSED';
    chip.title = 'this schedule fires nothing until it is resumed';
    el.append(chip);
  }
  el.append(acts(s));
  return el;
}

// The hint is OURS, not the browser's: a native title is drawn wherever the
// pointer happens to be, and on this pill that is on top of the schedule's own
// name — the one word the card exists to say. `data-tip` renders it under the
// head row instead, where it covers nothing.
function hookLink(s) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'sc-hook';
  b.textContent = '→ ' + s.hook;
  b.setAttribute('aria-label', 'the hook this fires: ' + s.hook);
  b.title = ''; // empty, not absent: it stops the head's own title firing here
  b.onclick = (e) => { e.stopPropagation(); if (openHookFn) openHookFn(s.hook); };
  // The pill itself clips its text to an ellipsis, so the hint hangs off a
  // wrapper — inside the pill it would be clipped away with the overflow.
  const wrap = document.createElement('span');
  wrap.className = 'sc-hook-wrap';
  wrap.setAttribute('data-tip', 'the hook this fires — show it on the hooks list');
  wrap.append(b);
  return wrap;
}

function acts(s) {
  const el = document.createElement('span');
  el.className = 'sc-acts';
  el.onclick = (e) => e.stopPropagation(); // the head toggles the firings; these do not
  const b = busy.has(s.name);
  // '‖' rather than the pause pictograph: U+23F8 has no glyph in the fonts this
  // board ships with and renders as a box, which is not a button anyone presses.
  el.append(
    act(b ? '…' : s.paused ? '▶' : '‖', b,
      s.paused ? 'resume — the cursor re-arms at now, so it wakes up owing no windows'
        : 'pause — it fires nothing until resumed',
      () => setPaused(s, !s.paused)),
    act('✕', b, 'remove this schedule — the hook itself survives', () => remove(s)),
  );
  return el;
}

function act(label, disabled, title, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'au-act';
  b.textContent = label;
  b.title = title;
  b.disabled = disabled;
  b.onclick = onClick;
  return b;
}

// ---------- the words, exactly the ones `schedule list` says ----------
// A screen and a CLI describing the same clock in two vocabularies is two
// things to learn, so these are the CLI's own phrasings.

// 'in 3m' — how far off the next fire is.
function until(iso) {
  const t = Date.parse(iso || '');
  if (!t) return 'never';
  const s = Math.round((t - Date.now()) / 1000);
  if (s <= 0) return 'due now';
  if (s < 60) return 'in ' + s + 's';
  if (s < 3600) return 'in ' + Math.round(s / 60) + 'm';
  if (s < 86400) return 'in ' + Math.round(s / 3600) + 'h';
  return 'in ' + Math.round(s / 86400) + 'd';
}

// 'now' is not a thing a past event is, so the smallest unit here is seconds —
// util's ago() rounds the first minute to "now", which would read "fired now".
function since(iso) {
  const t = Date.parse(iso || '');
  if (!t) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
}

function howRunEnded(r) {
  return r.skipped ? 'skipped' : r.timedOut ? 'timed out' : r.error ? 'failed to start'
    : r.canceled ? 'restarted mid-run' : r.code === null ? 'killed' : 'exit ' + r.code;
}

// A SKIP is a firing too — that is the whole point of recording it — so it reads
// as one rather than as silence.
function fireOutcome(r) {
  if (!r) return 'never fired';
  if (r.skipped) return 'skipped ' + since(r.started) + ' (previous firing still going)';
  return 'fired ' + since(r.started) + ' · ' + howRunEnded(r);
}

function outcomeClass(r) {
  if (!r) return 'sc-never';
  return r.skipped ? 'sc-skip' : r.ok ? 'sc-ok' : 'sc-bad';
}

// The four facts a schedule IS, each under its own caption: when it fires, how
// long until the next one, how the last one ended, and who a failure wakes. The
// tab this replaced ran them together as one dim line — six facts in 11px grey,
// which is how a screen says nothing on it matters.
//
// The last fire keeps a colour of its own, because a red one has to be what the
// eye lands on.
function stats(s) {
  const el = document.createElement('div');
  el.className = 'au-stats';
  el.append(
    stat('when', s.describe),
    stat('next fire', nextText(s), s.paused || s.problem ? 'au-off' : 'sc-next'),
    stat('last fire', fireOutcome(s.last), outcomeClass(s.last)),
    stat('owner', s.owner, 'au-who'),
  );
  return el;
}

// A schedule with a problem has a next window and will not take it — the tick
// refuses to fire it — so "in 4m" would be the plausible-looking lie the problem
// is there to replace. Paused is the same shape of not-coming.
function nextText(s) {
  return s.paused ? 'paused' : s.problem ? 'fires nothing' : until(s.next);
}

// caption over value. The caption is what lets the value be a bare "in 3m"
// rather than "next fire: in 3m" on every card.
function stat(cap, value, cls) {
  const el = document.createElement('div');
  el.className = 'au-stat';
  const c = document.createElement('div');
  c.className = 'au-cap';
  c.textContent = cap;
  const v = document.createElement('div');
  v.className = 'au-val' + (cls ? ' ' + cls : '');
  v.textContent = value;
  el.append(c, v);
  return el;
}

function problem(s) {
  const el = document.createElement('div');
  el.className = 'sc-problem';
  el.textContent = '⚠ ' + s.problem;
  return el;
}

// ---------- the firings, in the board's own detail panel ----------
// The panel holds the list and NOTHING else: one line per firing — when, how it
// ended, how long it took. The output of a firing is a terminal's output, and
// pouring it in here is what buried every other firing under one blob; it opens
// in a modal instead, one firing at a time.
const runKey = (name) => 'schedule:' + name;

function panelSubject(name) {
  return {
    key: runKey(name),
    emoji: '⚡',
    title: name,
    sub: 'schedule · firings',
    paint: (el) => paintFirings(el, name),
    onClose: () => { if (openName === name) { openName = ''; runs.delete(name); paint(); } },
  };
}

// The firings, newest first — the trace's own records, not a second copy kept
// on the schedule.
function paintFirings(el, name) {
  const list = runs.get(name);
  // Signature, not a blind rebuild: the panel repaints on every board event and
  // a rebuild under a finger would drop the press that is landing on it.
  const sig = name + '\n' + (list ? list.map((r) => r.started + '|' + r.ms + '|' + howRunEnded(r)).join('\n') : '…');
  if (el.__bcSig === sig) return;
  el.__bcSig = sig;
  el.textContent = '';
  const head = document.createElement('div');
  head.className = 'dt-events-head';
  head.textContent = 'firings';
  el.append(head);
  const box = document.createElement('div');
  box.className = 'dt-runs';
  el.append(box);
  if (!list) { box.append(runNote('reading the firings…')); return; }
  if (!list.length) { box.append(runNote('no firings recorded')); return; }
  for (const r of list) box.append(firingLine(name, r));
}

function runNote(text) {
  const el = document.createElement('div');
  el.className = 'dt-run-note';
  el.textContent = text;
  return el;
}

// One line, and it is a button: the log is behind it.
function firingLine(name, r) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'dt-run';
  b.title = 'the output of this firing';
  const when = document.createElement('span');
  when.className = 'dt-run-when';
  when.textContent = hhmm(r.started);
  const how = document.createElement('span');
  how.className = 'dt-run-how ' + outcomeClass(r);
  how.textContent = howRunEnded(r);
  const ms = document.createElement('span');
  ms.className = 'dt-run-ms';
  ms.textContent = r.ms + 'ms';
  b.append(when, how, ms);
  b.onclick = () => openLog(name + ' · ' + hhmm(r.started), r.output);
  return b;
}

// ---------- the presses ----------

// Pressing a card opens its firings beside it; pressing the open one closes the
// panel. The card itself never grows, so the column never reflows.
async function toggle(s) {
  if (openName === s.name && auxDetailKey() === runKey(s.name)) return closeDetail();
  openName = s.name;
  paint(); // the caret turns now; the panel says it is reading until the fetch lands
  openAuxDetail(panelSubject(s.name));
  try {
    runs.set(s.name, (await api.schedule(s.name)).runs || []);
  } catch (e) {
    say('⚠ ' + s.name + ': ' + e.message);
    shutPanel();
    return paint();
  }
  repaintAuxDetail();
}

// The panel is gone (closed from the ✕, or its schedule was removed): forget the
// subject and let the cards say so.
function shutPanel() {
  const name = openName;
  openName = '';
  if (name) runs.delete(name);
  if (auxDetailKey() === runKey(name)) closeDetail();
}

// The press is held HERE and not on the button, because a board event repaints
// every row mid-request: a button that came back enabled under his thumb would
// be a second write the server then has to sort out.
async function setPaused(s, paused) {
  if (busy.has(s.name)) return;
  busy.add(s.name);
  paint();
  let note;
  try {
    const r = await api.pauseSchedule(s.name, paused);
    note = s.name + (paused ? ' paused — it fires nothing until resumed'
      : ' resumed — next fire ' + until(r.schedule && r.schedule.next));
  } catch (e) { note = '⚠ ' + s.name + ': ' + e.message; }
  busy.delete(s.name);
  await renderSchedules();
  say(note);
}

// The confirm says what removal does NOT do, because that is the part he cannot
// see from here: it forgets a clock entry, it does not delete a script. It says
// "untouched" rather than "still there" — the schedule most likely to be removed
// from this screen is one whose hook is already gone, and that is exactly the row
// a promise about the file still existing would be a lie on.
async function remove(s) {
  if (busy.has(s.name)) return;
  if (!confirm('Remove the schedule "' + s.name + '"?\n\n'
    + 'The hook ' + s.hook + ' is untouched — only the clock entry goes, so nothing fires it any more.')) return;
  busy.add(s.name);
  paint();
  let note;
  try {
    await api.removeSchedule(s.name);
    note = s.name + ' removed — the hook ' + s.hook + ' is untouched';
  } catch (e) { note = '⚠ ' + s.name + ': ' + e.message; }
  busy.delete(s.name);
  if (openName === s.name) shutPanel();
  await renderSchedules();
  say(note);
}

// ---------- add ----------
// The two pickers are the point of having a form at all: a hook that exists and
// an owner who is registered are the two refusals `add` spends most of its time
// on, and a free-text box would earn both of them again every time.
async function loadPickers() {
  try {
    const [h, l] = await Promise.all([api.hooks(), api.lieutenants()]);
    // A schedule fires a NAMED hook — a lifecycle hook is fired by the event
    // that owns it, so it is not on this list.
    fill(hookEl, (h.hooks || []).filter((x) => !x.event).map((x) => x.name), 'no named hooks');
    fill(ownerEl, (l.lieutenants || []).map((x) => x.id), 'no lieutenants');
  } catch (e) { say('⚠ ' + e.message); }
}

// Rebuilt only when the set actually changed: a repaint that reset a picker
// under his finger would be the same bug as one that ate what he typed.
function fill(sel, values, empty) {
  const want = values.join('\n');
  if (sel.dataset.filled === want) return;
  sel.dataset.filled = want;
  const had = sel.value;
  sel.textContent = '';
  for (const v of (values.length ? values : [''])) {
    const o = document.createElement('option');
    o.value = values.length ? v : '';
    o.textContent = values.length ? v : empty;
    sel.append(o);
  }
  if (values.includes(had)) sel.value = had;
}

// Opening the form is the moment its pickers have to be right — a hook dropped
// in a minute ago belongs on the list he is about to choose from.
addEl.ontoggle = () => { if (addEl.open) loadPickers(); };

formEl.onsubmit = async (e) => {
  e.preventDefault();
  say('');
  try {
    const r = await api.addSchedule({
      name: nameEl.value.trim(), hook: hookEl.value, when: whenEl.value.trim(),
      owner: ownerEl.value, overlap: overlapEl.value, catchup: catchupEl.value,
    });
    nameEl.value = '';
    whenEl.value = '';
    addEl.open = false;
    await renderSchedules();
    say(r.schedule.name + ' added — ' + r.schedule.hook + ' ' + r.schedule.describe
      + ', owner ' + r.schedule.owner + '; next fire ' + until(r.schedule.next));
  } catch (err) {
    // VERBATIM. The refusal names the offending text — which `when` did not
    // parse, which hook is not there — and "invalid" would throw all of it away.
    say('⚠ ' + err.message);
  }
};
