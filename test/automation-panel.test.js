'use strict';
// Where a schedule OPENS. The ⚡ screen shipped with the firings expanding in
// place: the card grew, everything under it moved, and a whole log blob landed
// in the column. Two moves fix it and this file pins both.
//
//   a schedule opens in the board's own detail panel — the same aside a card
//   opens in, not a second one that looks like it
//   a firing opens its log in a modal — the same overlay the peek drawer and
//   the load monitor use
//
// The seams: the panel is #dt-aux INSIDE #detail (so the width, the drag
// handle, the ✕ and the phone's full-screen all come for free), nothing in the
// firings list holds output any more, and the modal closes the three ways every
// other overlay on this board closes.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ui = (...p) => path.join(__dirname, '..', 'ui', ...p);
const html = fs.readFileSync(ui('index.html'), 'utf8');
const css = fs.readFileSync(ui('app.css'), 'utf8');
const sc = fs.readFileSync(ui('js', 'scmanager.js'), 'utf8');
const dt = fs.readFileSync(ui('js', 'detail.js'), 'utf8');
const log = fs.readFileSync(ui('js', 'logview.js'), 'utf8');
const main = fs.readFileSync(ui('js', 'main.js'), 'utf8');

test('a schedule opens in the board\'s own panel, not in a second one that looks like it', () => {
  // one aside in the whole page, and the second subject lives inside it
  assert.strictEqual((html.match(/<aside id="detail"/g) || []).length, 1);
  const aside = html.slice(html.indexOf('<aside id="detail"'), html.indexOf('</aside>'));
  assert.ok(aside.includes('id="dt-aux"'), 'the second subject paints inside the card panel');
  assert.match(dt, /export function openAuxDetail\(a\)/);
  assert.match(sc, /import \{ openAuxDetail, auxDetailKey, repaintAuxDetail, closeDetail \} from '\.\/detail\.js'/,
    'the column reaches for that panel rather than building one');
  // the same open, the same close: one ✕, one Escape branch, one click-outside
  assert.match(dt, /export function detailOpen\(\) \{ return !!S\.openCardId \|\| !!aux; \}/,
    'Escape and the ✕ see one panel, whichever subject is in it');
  assert.match(dt, /if \(\(!S\.openCardId && !aux\) \|\| !isDesktop\(\)\) return;/,
    'and so does the desktop click-outside');
});

// The panel is the card's own aside, so its width, its drag handle and its
// 100vw at a phone width are the ones already there — what a card fills in is
// simply hidden while a schedule is in it.
test('the panel inherits the card panel\'s width and its phone behaviour', () => {
  assert.match(css, /#detail \{[^}]*width: min\(var\(--detail-w, 560px\), 100vw\)/);
  assert.match(css, /#detail \{ width: 100vw; border-left: none; \}/, 'full-screen on a phone');
  assert.match(css, /#detail\.dt-aux-on \.dt-strip,[\s\S]*?display: none; \}/,
    'the card-only parts stand down rather than being duplicated');
});

test('the panel holds the firings and nothing else — one line each, no log text', () => {
  assert.match(sc, /head\.textContent = 'firings'/);
  assert.match(sc, /b\.append\(when, how, ms\)/, 'time, how it ended, how long it took');
  // the blob that used to live in the column is gone from both the code and the
  // stylesheet — a list that can hold output grows back into one that does
  assert.ok(!/ansiToHtml/.test(sc), 'no output is rendered into the list');
  assert.ok(!/sc-out|sc-runs/.test(sc + css), 'and the inline firings block is gone');
  assert.ok(!/el\.append\(firings\(s\)\)/.test(sc), 'a card never grows a panel of its own');
});

test('a firing opens its log in a modal, closed the three ways everything here closes', () => {
  const modal = html.slice(html.indexOf('<div id="log-overlay"'), html.indexOf('<!-- artifact viewer'));
  assert.ok(modal.includes('id="log-close"'), 'a close button');
  assert.ok(modal.includes('<pre id="log-body">'), 'and a terminal surface for the output');
  assert.match(log, /overlay\.onclick = \(e\) => \{ if \(e\.target === overlay\) closeLog\(\); \};/, 'the backdrop');
  assert.match(main, /else if \(logOpen\(\)\) closeLog\(\);/, 'and Escape');
  assert.match(css, /#log-body \{[^}]*font-family: var\(--mono\)/, 'monospace');
  assert.match(css, /#log-body \{[^}]*overflow: auto/, 'scrolling inside the modal');
  assert.match(sc, /b\.onclick = \(\) => openLog\(name \+ ' · ' \+ hhmm\(r\.started\), r\.output\)/);
  // the text is already in hand — the log costs no read
  assert.ok(!/api\./.test(log), 'the modal reads nothing');
});

// A native title is drawn wherever the pointer is, and on this pill that is on
// top of the schedule's own name — the one word the card exists to say.
test('the → hook hint hangs under the head row instead of over the name', () => {
  assert.match(sc, /wrap\.setAttribute\('data-tip'/);
  // empty, not absent: an absent title lets the head's own tooltip fire here
  assert.match(sc, /b\.title = ''; \/\/ empty, not absent/);
  assert.match(css, /\.sc-hook-wrap\[data-tip\]::after \{[^}]*top: calc\(100% \+ 6px\)/);
  assert.match(css, /\.sc-head \{ position: relative; \}/, 'anchored to the row, not to the page');
});

// The panel belongs to the ⚡ screen: leaving the mode takes it along rather
// than leaving a schedule floating over the kanban.
test('leaving the mode closes the panel, and so does removing the schedule', () => {
  assert.match(main, /if \(mode !== S\.boardMode && auxDetailKey\(\)\) closeDetail\(\);/);
  assert.match(sc, /if \(openName && !items\.some\(\(s\) => s\.name === openName\)\) shutPanel\(\);/);
});
