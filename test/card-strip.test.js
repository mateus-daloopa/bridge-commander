'use strict';
// The COLLAPSED LINE at the top of an open card. It leads with the PR state —
// the attribute he actually looks for — then spends whatever room is left on
// the last timeline event, and truncates instead of wrapping.
// util.js is browser ES-module code but touches no DOM at import time, so the
// renderer can be imported directly (detail.js cannot — it binds DOM at
// import). The no-wrap/ellipsis claim lives in app.css, asserted against source.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const utilMod = import(pathToFileURL(path.join(__dirname, '..', 'ui', 'js', 'util.js')).href);
const css = fs.readFileSync(path.join(__dirname, '..', 'ui', 'app.css'), 'utf8');

const CARD = {
  id: 'MNC-1',
  attributes: { prs: [{ url: 'https://github.com/o/r/pull/42', state: 'merged' }] },
  events: [
    { kind: 'start', text: 'worker started', ts: '2026-01-01T00:00:00Z' },
    { kind: 'done', text: 'the last thing that happened', ts: '2026-01-01T01:00:00Z' },
  ],
};
const emojiFor = (k) => (k === 'done' ? '🏁' : '');

test('the line leads with the PR state, then the last event', async () => {
  const { cardStripHtml } = await utilMod;
  const html = cardStripHtml(CARD, emojiFor);
  assert.ok(html.indexOf('prchip') < html.indexOf('dt-strip-ev'), 'PR comes first');
  assert.match(html, /pr-merged/);
  assert.match(html, /#42 · merged/);
  assert.ok(html.includes('🏁 the last thing that happened'), 'the LAST event, with its kind emoji');
  assert.ok(!html.includes('worker started'), 'only the last one');
});

test('no PR and no events still render a clickable row', async () => {
  const { cardStripHtml } = await utilMod;
  const html = cardStripHtml({ id: 'MNC-2' }, emojiFor);
  assert.match(html, /dt-strip-chev/);
  assert.match(html, /no events yet/);
  assert.ok(!html.includes('prchip'));
});

test('event text is escaped', async () => {
  const { cardStripHtml } = await utilMod;
  const html = cardStripHtml({ events: [{ kind: 'x', text: '<img src=x>' }] }, emojiFor);
  assert.ok(!html.includes('<img'), 'no raw html from an event');
});

test('the row truncates instead of wrapping', () => {
  const m = /\.dt-strip-ev\s*\{([^}]*)\}/.exec(css);
  assert.ok(m, '.dt-strip-ev is styled');
  assert.match(m[1], /white-space:\s*nowrap/);
  assert.match(m[1], /text-overflow:\s*ellipsis/);
  assert.match(m[1], /min-width:\s*0/, 'so the PR chip can eat the room');
});

test('artifacts collapse, and an empty block shows nothing', () => {
  assert.match(css, /\.dt-artifacts\.closed \.arts-scroll \{ display: none; \}/);
  assert.match(css, /\.dt-artifacts:empty \{ display: none; \}/);
});
