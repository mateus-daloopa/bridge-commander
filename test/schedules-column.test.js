'use strict';
// The ⚡ screen's schedules column — the clock MNC-25 shipped without a screen
// and MNC-84 gave a line of grey text on a config tab:
//
//   ▸ gh-watch  → gh-watch                                     ‖  ✕
//     WHEN       NEXT FIRE   LAST FIRE               OWNER
//     every 5m   in 3m       fired 2m ago · exit 0   tonylampada
//
// scmanager.js binds DOM at import, so the parts that decide what a card SAYS
// are lifted out of the source and run against stubs — the same spirit as
// hooks-column.test.js. What is pinned here: the markup lives on the automation
// screen, the card speaks the CLI's own words, PAUSED is a state rather than a
// shade, anything red is red AND first, a `problem` is shown in full, the
// server's refusal survives verbatim, and nothing here grew an endpoint.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ui = (...p) => path.join(__dirname, '..', 'ui', ...p);
const html = fs.readFileSync(ui('index.html'), 'utf8');
const css = fs.readFileSync(ui('app.css'), 'utf8');
const src = fs.readFileSync(ui('js', 'scmanager.js'), 'utf8');
const apiSrc = fs.readFileSync(ui('js', 'api.js'), 'utf8');
const screen = html.slice(html.indexOf('id="auto-screen"'), html.indexOf('</main>'));

test('the schedules column lives on the automation screen, beside the hooks it fires', () => {
  assert.ok(screen.includes('id="sc-list"'), 'the list');
  assert.ok(screen.includes('id="sc-count"'), 'the count beside the column heading');
  assert.ok(screen.includes('id="sc-add"'), 'and the add form');
  // A press's only answer must outlive the next board event: paint() clears the
  // list on every repaint, so the note cannot live inside it.
  assert.ok(screen.includes('id="sc-note"'), 'the note a press answers in');
  assert.ok(screen.indexOf('id="sc-note"') > screen.indexOf('id="sc-list"'), 'outside the list, after it');
  // the clock leads: a schedule is the live thing, a hook is the script it fires
  assert.ok(screen.indexOf('id="sc-list"') < screen.indexOf('id="hk-list"'));
  assert.ok(!html.includes('data-tab="schedules"'), 'and it is no longer a config tab');
});

// The two decisions a card makes, lifted and run against records shaped like
// GET /api/schedules answers.
function loadCardText() {
  const at = src.indexOf('function until');
  const end = src.indexOf('\nfunction problem');
  assert.ok(at > -1 && end > at, 'the wording helpers found in scmanager.js');
  const document = { createElement: () => {
    const parts = [];
    const e = { parts, className: '', title: '', textContent: '', append: (...xs) => parts.push(...xs) };
    Object.defineProperty(e, 'text', { get() {
      return parts.length
        ? parts.map((p) => (typeof p === 'string' ? p : p.text)).join(' ').trim()
        : e.textContent;
    } });
    return e;
  } };
  const make = new Function('document', src.slice(at, end)
    + '\nreturn { until, since, howRunEnded, fireOutcome, outcomeClass, nextText, stats };');
  return make(document);
}
const iso = (deltaSec) => new Date(Date.now() + deltaSec * 1000).toISOString();

test('next fire and last fire are relative, in the words the CLI prints', () => {
  const { until, since, fireOutcome } = loadCardText();
  assert.strictEqual(until(iso(180)), 'in 3m');
  assert.strictEqual(until(iso(2 * 3600)), 'in 2h');
  assert.strictEqual(until(iso(-5)), 'due now');
  assert.strictEqual(until(null), 'never', 'a `when` that no longer parses has no next fire');
  assert.strictEqual(since(iso(-120)), '2m ago');
  assert.strictEqual(since(iso(-5)), '5s ago', 'a past firing is never "now"');
  assert.strictEqual(fireOutcome(null), 'never fired', 'a schedule that never fired says so');
  assert.strictEqual(fireOutcome({ started: iso(-120), code: 0, ok: true }), 'fired 2m ago · exit 0');
  assert.strictEqual(fireOutcome({ started: iso(-3600), code: 3 }), 'fired 1h ago · exit 3');
  // A skip IS a firing — a schedule whose every window is skipped must not read
  // like one that is quietly working.
  assert.strictEqual(fireOutcome({ started: iso(-120), skipped: true }),
    'skipped 2m ago (previous firing still going)');
});

test('how a firing ended is said the one way the CLI says it', () => {
  const { howRunEnded } = loadCardText();
  assert.strictEqual(howRunEnded({ code: 0 }), 'exit 0');
  assert.strictEqual(howRunEnded({ timedOut: true }), 'timed out');
  assert.strictEqual(howRunEnded({ error: 'ENOENT' }), 'failed to start');
  assert.strictEqual(howRunEnded({ canceled: true, code: null }), 'restarted mid-run');
  assert.strictEqual(howRunEnded({ code: null }), 'killed');
  assert.strictEqual(howRunEnded({ skipped: true }), 'skipped');
});

// The change the captain asked for: six facts run together in one 11px grey line
// is how a screen says nothing on it matters. Four facts, each under its own
// caption, is the answer.
test('a card carries when, next fire, last fire and owner as four captioned facts', () => {
  const { stats } = loadCardText();
  assert.strictEqual(stats({ describe: 'every 5m', next: iso(180), owner: 'tonylampada',
    last: { started: iso(-120), code: 0, ok: true } }).text,
  'when every 5m next fire in 3m last fire fired 2m ago · exit 0 owner tonylampada');
  assert.match(css, /\.au-stats \{[^}]*display: flex/, 'and they lay out as a row of blocks');
  assert.match(css, /\.au-cap \{[^}]*color: var\(--faint\)/, 'the caption is the quiet half');
  assert.match(css, /\.au-val \{\n  font-size: 14px/, 'the value is the loud one');
});

test('a next fire that is not coming says so, rather than printing a plausible one', () => {
  const { nextText } = loadCardText();
  assert.strictEqual(nextText({ next: iso(180) }), 'in 3m');
  // Paused replaces the next fire, because there is not one — printing a
  // plausible "in 3m" for a clock that fires nothing is the lie the chip exists
  // to stop.
  assert.strictEqual(nextText({ next: iso(180), paused: true }), 'paused');
  // A schedule with a problem HAS a next window and the tick will refuse it, so
  // "in 3m" would be exactly the plausible-looking lie `problem` exists to
  // replace.
  assert.strictEqual(nextText({ next: iso(180), problem: 'hook "doomed" is gone' }), 'fires nothing');
});

test('the last fire wears a colour, so a red schedule is what the eye lands on', () => {
  const { outcomeClass } = loadCardText();
  assert.strictEqual(outcomeClass(null), 'sc-never');
  assert.strictEqual(outcomeClass({ ok: true }), 'sc-ok');
  assert.strictEqual(outcomeClass({ ok: false }), 'sc-bad');
  assert.strictEqual(outcomeClass({ skipped: true }), 'sc-skip');
  assert.match(css, /\.sc-bad \{ color: var\(--danger\); \}/);
});

// The whole reason this column is worth having: a schedule whose hook was
// deleted, or whose `when` stopped parsing, fires nothing forever and looks
// exactly like a working one.
test('a problem is unmissable — the whole sentence, in red, on a red card', () => {
  assert.match(src, /el\.textContent = '⚠ ' \+ s\.problem/, 'in full: never truncated, never a title');
  assert.ok(!/s\.problem\.slice|s\.problem\.split/.test(src), 'and never cut down');
  assert.match(css, /\.sc-problem \{[^}]*color: var\(--danger\)/);
  assert.match(css, /\.sc-problem \{[^}]*overflow-wrap: anywhere/, 'a whole sentence wraps rather than clips');
});

// A `problem` and a firing that came back non-zero are the same news to him, so
// one rule paints both — and puts them first, because red below the fold is red
// he does not see.
test('anything red is red AND first', () => {
  assert.match(src, /function isBad\(s\) \{ return !!s\.problem \|\| !!\(s\.last && !s\.last\.skipped && !s\.last\.ok\); \}/);
  assert.match(src, /el\.className = 'sc-row' \+ \(isBad\(s\) \? ' au-bad' : ''\)/);
  assert.match(css, /\.au-bad \{ border-left-color: var\(--danger\); background: var\(--danger-soft\); \}/);
  assert.match(src, /const rank = \(s\) => \(isBad\(s\) \? 0 : s\.paused \? 1 : 2\)/);
  assert.match(src, /rank\(a\[0\]\) - rank\(b\[0\]\) \|\| a\[1\] - b\[1\]/,
    'stable within a rank — nothing shuffles under a finger while everything is green');
});

test('paused is a state at a glance, not an inference from a greyed card', () => {
  assert.match(src, /chip\.textContent = 'PAUSED'/);
  assert.match(css, /\.sc-chip \{[^}]*color: var\(--warn\)/);
  assert.match(css, /\.sc-row\.sc-off \{ border-left-color: var\(--warn\); \}/);
});

// A schedule fires a hook. Both halves of that are on this one screen now, so
// each is a way to the other rather than a tab switch and a hunt.
test('the hook name is the way to that hook, and the hook card names its way back', () => {
  assert.match(src, /export function onOpenHook\(fn\)/);
  assert.match(src, /b\.textContent = '→ ' \+ s\.hook/);
  assert.match(src, /export function focusSchedule\(name\)/);
  const auto = fs.readFileSync(ui('js', 'automation.js'), 'utf8');
  assert.match(auto, /onOpenHook\(focusHook\)/);
  assert.match(auto, /onOpenSchedule\(focusSchedule\)/);
  const hk = fs.readFileSync(ui('js', 'hkmanager.js'), 'utf8');
  assert.match(hk, /export function focusHook\(name\)/);
  assert.match(hk, /marked\.scrollIntoView/, 'and the card it lands on is marked');
  assert.match(src, /marked\.scrollIntoView/);
  assert.match(css, /\.au-focus \{/);
});

test('pause, resume and remove go through the CLI\'s own doors', () => {
  assert.match(apiSrc, /pauseSchedule: \(name, paused\) => j\('PATCH', '\/api\/schedules\/' \+ encodeURIComponent\(name\), \{ paused \}\)/);
  assert.match(apiSrc, /removeSchedule: \(name\) => j\('DELETE', '\/api\/schedules\/' \+ encodeURIComponent\(name\)\)/);
  // Removing is destructive and asymmetric — the hook survives, and that is the
  // part he cannot see from this screen.
  assert.match(src, /confirm\('Remove the schedule/);
  // "untouched", not "still there": the schedule most likely to be removed here
  // is one whose hook is already gone.
  assert.match(src, /is untouched — only the clock entry goes/);
});

test('add picks its hook and its owner rather than asking him to spell them', () => {
  assert.ok(screen.includes('<select id="sc-hook"'), 'the hook is a picker');
  assert.ok(screen.includes('<select id="sc-owner"'), 'and so is the owner');
  assert.match(src, /\.filter\(\(x\) => !x\.event\)/, 'over the NAMED hooks — a lifecycle hook is fired by its event');
  assert.match(src, /api\.lieutenants\(\)/, 'and over the registered lieutenants');
  // A repaint arrives on every board event; a picker rebuilt under his finger
  // would lose the choice he just made.
  assert.match(src, /if \(sel\.dataset\.filled === want\) return/);
});

test('the server\'s refusal is shown verbatim — it names the offending text', () => {
  assert.match(src, /say\('⚠ ' \+ err\.message\)/);
  // …and it reads as a refusal rather than as faint chatter
  assert.match(src, /noteEl\.classList\.toggle\('sc-warn', text\.startsWith\('⚠'\)\)/);
  assert.match(css, /#sc-note\.sc-warn \{ color: var\(--danger\); \}/);
  assert.ok(!/'invalid'|'bad when'/.test(src), 'nothing here replaces the message with a word');
});

test('no new endpoints — every door is one bc-axi schedule already posts to', () => {
  assert.match(apiSrc, /schedules: \(\) => j\('GET', '\/api\/schedules'\)/);
  assert.match(apiSrc, /schedule: \(name\) => j\('GET', '\/api\/schedules\/' \+ encodeURIComponent\(name\)\)/);
  assert.match(apiSrc, /addSchedule: \(s\) => j\('POST', '\/api\/schedules'/);
  // The firings come off the trace through GET /api/schedules/<name>, filtered
  // to this schedule's trigger server-side — no second copy, no second route.
  assert.match(src, /api\.schedule\(s\.name\)\)\.runs/);
  const calls = [...src.matchAll(/api\.(\w+)\(/g)].map((m) => m[1]).sort();
  assert.deepStrictEqual([...new Set(calls)].sort(),
    ['addSchedule', 'hooks', 'lieutenants', 'pauseSchedule', 'removeSchedule', 'schedule', 'schedules'],
    'and the column calls nothing else');
});

test('the column is wired into the screen through the one module that owns it', () => {
  const auto = fs.readFileSync(ui('js', 'automation.js'), 'utf8');
  assert.match(auto, /import \{ renderSchedules, scheduleCounts, focusSchedule, onOpenHook \} from '\.\/scmanager\.js'/);
  assert.match(src, /export async function renderSchedules\(reload\)/);
  const main = fs.readFileSync(ui('js', 'main.js'), 'utf8');
  assert.ok(!/scmanager\.js/.test(main), 'main.js reaches the column through automation.js');
});

// The screen's only nudge is the board event that already arrives — a schedule
// fires, or is paused from the CLI, and a card must not go on lying about it.
test('every render asks the server, and an in-flight press outlives the repaint', () => {
  assert.ok(!/if \(items\) return paint\(\)/.test(src), 'a list read last time is not the answer');
  assert.match(src, /const busy = new Set\(\)/, 'the press is state, not a mutated button');
  assert.match(src, /busy\.add\(s\.name\)/);
  assert.match(src, /busy\.delete\(s\.name\)/);
  assert.ok(!/btn\.disabled|btn\.textContent/.test(src),
    'nothing writes to a button a repaint may already have thrown away');
  assert.ok(!/setInterval|setTimeout/.test(src), 'no polling — the board events are the nudge');
  // Only the schedule the panel is showing is re-read: its firings must stay
  // current, and a panel nobody opened must cost nothing.
  assert.match(src, /if \(openName\) \{\n\s*try \{ runs\.set\(openName,/);
});
