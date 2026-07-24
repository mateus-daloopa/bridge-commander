'use strict';
// copyText (ui/js/md.js) — the one clipboard helper behind every copy
// affordance. The load-bearing claim: over plain HTTP (tailnet phone) there is
// no navigator.clipboard, and the execCommand fallback must then run
// SYNCHRONOUSLY inside the click call — execCommand outside a user gesture is
// a silent no-op on mobile Safari. Node lets us pin exactly that ordering with
// stub navigator/document globals.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const mdMod = import(pathToFileURL(path.join(__dirname, '..', 'ui', 'js', 'md.js')).href);

// navigator exists as a global getter in modern Node — replace via defineProperty
function setNavigator(v) {
  Object.defineProperty(globalThis, 'navigator', { value: v, configurable: true, writable: true });
}
// minimal DOM for the textarea fallback; records the execCommand call
function stubDocument(execResult) {
  const calls = { exec: 0, value: null, appended: 0, removed: 0, selected: 0 };
  const ta = {
    style: {},
    value: null,
    select() { calls.selected++; },
    remove() { calls.removed++; },
  };
  globalThis.document = {
    createElement: () => ta,
    body: { appendChild(n) { calls.appended++; calls.value = n.value; } },
    execCommand(cmd) { assert.strictEqual(cmd, 'copy'); calls.exec++; return execResult; },
  };
  return calls;
}

test('no navigator.clipboard (insecure context): execCommand runs synchronously in the call', async () => {
  setNavigator({}); // plain-HTTP browser: clipboard is undefined
  const calls = stubDocument(true);
  const { copyText } = await mdMod;
  const p = copyText('hello board');
  // asserted BEFORE awaiting: the fallback fired inside the click's own call
  assert.strictEqual(calls.exec, 1);
  assert.strictEqual(calls.value, 'hello board');
  assert.strictEqual(calls.selected, 1);
  assert.strictEqual(calls.removed, 1); // textarea cleaned up
  assert.strictEqual(await p, true);
});

test('fallback reports failure honestly when execCommand returns false', async () => {
  setNavigator({});
  stubDocument(false);
  const { copyText } = await mdMod;
  assert.strictEqual(await copyText('x'), false);
});

test('secure context: navigator.clipboard.writeText is used, no textarea', async () => {
  let written = null;
  setNavigator({ clipboard: { writeText: (t) => { written = t; return Promise.resolve(); } } });
  const calls = stubDocument(true);
  const { copyText } = await mdMod;
  assert.strictEqual(await copyText('via clipboard api'), true);
  assert.strictEqual(written, 'via clipboard api');
  assert.strictEqual(calls.exec, 0);
});

test('writeText rejection (focus/permission) falls back to execCommand', async () => {
  setNavigator({ clipboard: { writeText: () => Promise.reject(new Error('denied')) } });
  const calls = stubDocument(true);
  const { copyText } = await mdMod;
  assert.strictEqual(await copyText('fallback text'), true);
  assert.strictEqual(calls.exec, 1);
  assert.strictEqual(calls.value, 'fallback text');
});
