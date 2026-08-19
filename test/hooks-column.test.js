'use strict';
// The ⚡ screen's hooks column — one card per hook:
//
//   gh-watch                                                    ▶  ✎
//   FIRED BY            LAST RUN
//   ⚡ gh-watch          ran 4m ago · exit 0
//
// hkmanager.js binds DOM at import, so the parts that decide what a card SAYS
// are lifted out of the source and run against stubs — the same spirit as
// settings-screen.test.js. What is pinned here: the markup lives on the
// automation screen (not the config screen it left), a card says what fires it
// and how the last run ended, red sorts to the top, and ▶/✎ reuse the two doors
// that already exist rather than growing a hook API of their own.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ui = (...p) => path.join(__dirname, '..', 'ui', ...p);
const html = fs.readFileSync(ui('index.html'), 'utf8');
const css = fs.readFileSync(ui('app.css'), 'utf8');
const src = fs.readFileSync(ui('js', 'hkmanager.js'), 'utf8');

test('the hooks column lives on the automation screen, not on a config tab', () => {
  const at = html.indexOf('id="auto-screen"');
  assert.ok(at > -1, 'the ⚡ screen is in index.html');
  const screen = html.slice(at, html.indexOf('</main>'));
  assert.ok(screen.includes('id="hk-list"'), 'the list');
  assert.ok(screen.includes('id="hk-count"'), 'the count beside the column heading');
  assert.ok(screen.includes('id="hk-dir"'), 'and the directory it reads, said once');
  // A press's only answer must outlive the next board event: paint() clears the
  // list on every repaint, so the note cannot live inside it.
  assert.ok(screen.includes('id="hk-note"'), 'the note the ▶ and the ✎ answer in');
  assert.ok(screen.indexOf('id="hk-note"') > screen.indexOf('id="hk-list"'), 'outside the list, after it');
  // …and both answers a press can give land in it, rather than in the list the
  // next repaint clears
  assert.match(src, /noteEl\.textContent = h\.name \+ ': ' \+ note/, 'the run outcome');
  assert.match(src, /noteEl\.textContent = '⚠ cannot open/, 'and a failed open');
  assert.ok(!/listEl\.textContent = '⚠ cannot open/.test(src), 'neither of them into the list');
  // the config screen kept the four things it configures and lost these two
  const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(tabs, ['labels', 'playbooks', 'projects', 'lieutenants']);
});

// The captain's complaint about the tab this replaced was that it was too small
// and nothing on it looked like it mattered. A card, a name at heading size, and
// every fact under its own caption is the answer to that — so those are pinned.
test('a hook is a card, not a line of grey: a real name and captioned facts', () => {
  assert.match(css, /\.sc-row, \.hk-row \{[^}]*border-left: 3px solid/, 'the state rail');
  assert.match(css, /\.hk-name \{[^}]*font-size: 17px/, 'the name is read, not squinted at');
  assert.match(css, /\.hk-name \{[^}]*text-overflow: ellipsis/, 'and the name is what gives way');
  assert.match(css, /\.au-cap \{[^}]*text-transform: uppercase/, 'each fact wears a caption');
  assert.match(css, /\.au-val \{\n  font-size: 14px/, 'and a value bigger than the caption');
  assert.match(css, /\.hk-acts \{[^}]*margin-left: auto/, 'the actions sit at the right end');
  assert.match(css, /\.au-act \{[^}]*padding: 7px 11px/, 'sized for a thumb');
});

// The functions that decide what a card says, lifted and run against records
// shaped like GET /api/hooks answers.
function loadCardText(schedules) {
  const at = src.indexOf('function outcome');
  const end = src.indexOf('\nfunction actions');
  assert.ok(at > -1 && end > at, 'outcome + facts found in hkmanager.js');
  const el = () => {
    const parts = [];
    const e = { parts, className: '', title: '', textContent: '', type: '', onclick: null,
      append: (...xs) => parts.push(...xs),
      classList: { add: (c) => { e.className += (e.className ? ' ' : '') + c; } } };
    Object.defineProperty(e, 'text', { get() {
      return parts.length
        ? parts.map((p) => (typeof p === 'string' ? p : p.text)).join(' ').trim()
        : e.textContent;
    } });
    return e;
  };
  const make = new Function('document', 'ago', 'schedulesForHook', 'openScheduleFn',
    src.slice(at, end) + '\nreturn { outcome, facts, firedBy, lastRun };');
  return make({ createElement: el }, (iso) => (iso === 'NOW' ? 'now' : iso),
    () => schedules || [], null);
}

test('a card says how the last run ended — and a hook that never ran says so', () => {
  const { outcome } = loadCardText();
  assert.strictEqual(outcome(null), 'never ran');
  assert.strictEqual(outcome({ started: '4m', code: 0 }), 'ran 4m ago · exit 0');
  assert.strictEqual(outcome({ started: '2h', code: 3 }), 'ran 2h ago · exit 3');
  assert.strictEqual(outcome({ started: '1d', timedOut: true }), 'ran 1d ago · timed out');
  assert.strictEqual(outcome({ started: '1d', error: 'ENOENT' }), 'ran 1d ago · never started');
  assert.strictEqual(outcome({ started: 'NOW', code: 0 }), 'ran just now · exit 0', 'never "now ago"');
});

test('the last run is a captioned fact, and running now beats every stored answer', () => {
  const { lastRun } = loadCardText();
  assert.strictEqual(lastRun({ last: { started: '4m', code: 0, ok: true } }, false).text,
    'last run ran 4m ago · exit 0');
  assert.strictEqual(lastRun({ last: null }, false).text, 'last run never ran');
  assert.strictEqual(lastRun({ last: { started: '4m', code: 0 }, running: { hook: 'x' } }, false).text,
    'last run running now', 'a run started from the CLI reads as running here too');
  assert.strictEqual(lastRun({ last: null }, true).text, 'last run running now', 'and so does a press');
});

// The half of the story two config tabs could not tell: a schedule fires a hook,
// and the hook card is where that reads without a tab switch.
test('a card says what fires it — the event, the schedules, or nothing at all', () => {
  assert.strictEqual(loadCardText().firedBy({ name: 'sweep.sh', event: 'worker-done' }).text,
    'fired by worker-done', 'a lifecycle hook names its event');
  assert.strictEqual(loadCardText([]).firedBy({ name: 'gh-watch', event: '' }).text,
    'fired by nothing — ▶ only', 'a named hook nothing points at says so');
  assert.strictEqual(loadCardText(['nightly', 'hourly']).firedBy({ name: 'digest', event: '' }).text,
    'fired by ⚡ nightly ⚡ hourly', 'and one two schedules fire names both');
  // the names come from the schedules column's own last answer — no second read
  assert.match(src, /import \{ schedulesForHook \} from '\.\/scmanager\.js'/);
  assert.match(fs.readFileSync(ui('js', 'scmanager.js'), 'utf8'),
    /export function schedulesForHook\(hook\)/);
});

test('a failed run is a red card that sorts to the top, not a red word to go looking for', () => {
  assert.match(src, /h\.last\.ok \? 'hk-ok' : 'hk-bad'/);
  assert.match(css, /\.hk-bad \{ color: var\(--danger\); \}/);
  assert.match(src, /function isBad\(h\) \{ return !!\(h\.last && !h\.last\.ok\); \}/);
  assert.match(src, /el\.className = 'hk-row' \+ \(isBad\(h\) \? ' au-bad' : ''\)/, 'the card itself is flagged');
  assert.match(css, /\.au-bad \{ border-left-color: var\(--danger\); background: var\(--danger-soft\); \}/);
  assert.match(src, /function ordered\(\)[\s\S]*?isBad\(b\[0\]\) - isBad\(a\[0\]\)/, 'red first');
  assert.match(src, /function ordered\(\)[\s\S]*?\|\| a\[1\] - b\[1\]/,
    'stable within a rank — nothing shuffles under a finger while everything is green');
});

// The one rule that keeps this from becoming a second editor and a second
// runner: ✎ goes through the artifact routes and the file screen, ▶ posts to
// the same door `bc-axi hook run` posts to.
test('▶ and ✎ reuse the doors that exist — no hook API of their own', () => {
  assert.match(src, /import \{ openArtifactFile \} from '\.\/detail\.js'/);
  assert.ok(!/mountFileEditor|CodeMirror/.test(src), 'and it never mounts an editor of its own');
  assert.match(src, /api\.runHook\(/);
  const api = fs.readFileSync(ui('js', 'api.js'), 'utf8');
  assert.match(api, /runHook: \(name\) => j\('POST', '\/api\/hooks\/run', \{ name, trigger: 'board' \}\)/,
    'the board run is traced as a board run');
  assert.match(api, /hooks: \(\) => j\('GET', '\/api\/hooks'\)/);
});

test('the column is wired into the screen through the one module that owns it', () => {
  const auto = fs.readFileSync(ui('js', 'automation.js'), 'utf8');
  assert.match(auto, /import \{ renderHooks, hookCounts, focusHook, onOpenSchedule \} from '\.\/hkmanager\.js'/);
  assert.match(src, /export async function renderHooks\(reload\)/);
  // …and main.js no longer knows this module exists
  const main = fs.readFileSync(ui('js', 'main.js'), 'utf8');
  assert.ok(!/hkmanager\.js/.test(main), 'main.js reaches the column through automation.js');
});

// The screen's only nudge is the board event that already arrives. A hook run
// from the CLI, or a lifecycle hook firing, is exactly what a card must not go
// on lying about — so every render asks, and the press that is still in flight
// survives the repaint that answer causes.
test('every render asks the server, and an in-flight ▶ outlives the repaint', () => {
  assert.ok(!/if \(items\) return paint\(\)/.test(src), 'a list read last time is not the answer');
  assert.match(src, /const running = new Set\(\)/, 'the press is state, not a mutated button');
  assert.match(src, /const busy = running\.has\(h\.name\)/, 'and paint() is what draws it');
  // Keyed PER NAME, because the server's lock is per workspace + name: a screen
  // stricter than the thing it drives owes an argument for being stricter, and
  // there is none. Two hooks running at once is what the server permits.
  assert.match(src, /running\.add\(h\.name\)/);
  assert.match(src, /running\.delete\(h\.name\)/);
  assert.ok(!/if \(running\) return/.test(src), 'one hook in flight never blocks another card');
  assert.ok(!/btn\.disabled|btn\.textContent/.test(src),
    'nothing writes to a button a repaint may already have thrown away');
  assert.ok(!/setInterval|setTimeout/.test(src), 'no polling — the board events are the nudge');
});
