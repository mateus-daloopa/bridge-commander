'use strict';
// ui/js/state.js — lieutenantsByRecent(), the order the lieutenant switcher
// captures when its dropdown opens: most recent conversation first, the silent
// ones last by name. Pure derivation over the doc, so it's imported directly
// (filters.test.js pattern). The FREEZE lives in ltswitcher.js, which touches
// the DOM at import — it is exercised in the browser, not here.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let S, lieutenantsByRecent;
test.before(async () => {
  ({ S, lieutenantsByRecent } =
    await import(pathToFileURL(path.join(__dirname, '..', 'ui', 'js', 'state.js')).href));
});

function seed(lieutenants) { S.doc = { lieutenants }; }
function order() { return lieutenantsByRecent().map((l) => l.id).join(' '); }

test('no doc: empty, no throw', () => {
  S.doc = null;
  assert.strictEqual(order(), '');
});

test('most recent chat message first, regardless of registration order', () => {
  seed([
    { id: 'monica', name: 'Monica', chat: [{ ts: '2026-07-27T10:00:00Z' }] },
    { id: 'rex', name: 'Rex', chat: [{ ts: '2026-07-27T09:00:00Z' }] },
    { id: 'quill', name: 'Quill', chat: [{ ts: '2026-07-27T12:00:00Z' }] },
  ]);
  assert.strictEqual(order(), 'quill monica rex');
});

test('the last message wins even if the chat is not in timestamp order', () => {
  seed([
    { id: 'a', name: 'A', chat: [{ ts: '2026-07-27T12:00:00Z' }, { ts: '2026-07-27T08:00:00Z' }] },
    { id: 'b', name: 'B', chat: [{ ts: '2026-07-27T10:00:00Z' }] },
  ]);
  assert.strictEqual(order(), 'a b');
});

test('never spoke goes last, in name order — no oscillating between equals', () => {
  seed([
    { id: 'z', name: 'Zoe' },
    { id: 'a', name: 'Ada', chat: [] },
    { id: 'm', name: 'Moss', chat: [{ ts: '2026-07-27T09:00:00Z' }] },
    { id: 'b', name: 'Bo', chat: [] },
  ]);
  assert.strictEqual(order(), 'm a b z');
});

test('ties break by name, and the same doc always yields the same order', () => {
  seed([
    { id: 'r', name: 'Rex', chat: [{ ts: '2026-07-27T09:00:00Z' }] },
    { id: 'a', name: 'Ada', chat: [{ ts: '2026-07-27T09:00:00Z' }] },
  ]);
  assert.strictEqual(order(), 'a r');
  assert.strictEqual(order(), 'a r');
});

test('nameless lieutenants fall back to id for the tie-break', () => {
  seed([{ id: 'zed' }, { id: 'abe' }]);
  assert.strictEqual(order(), 'abe zed');
});

test('does not mutate the doc order', () => {
  seed([
    { id: 'old', name: 'Old', chat: [{ ts: '2026-07-27T08:00:00Z' }] },
    { id: 'new', name: 'New', chat: [{ ts: '2026-07-27T12:00:00Z' }] },
  ]);
  lieutenantsByRecent();
  assert.deepStrictEqual(S.doc.lieutenants.map((l) => l.id), ['old', 'new']);
});
