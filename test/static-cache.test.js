'use strict';
// What the board tells a browser to keep.
//
// This is not a performance detail. `no-cache` permits a store-and-revalidate,
// and with no validator to revalidate against, a phone behind a CDN served the
// captain yesterday's JavaScript three times running — each time looking like a
// bug in whatever he was testing rather than a stale file. The rule now says
// what it means: our own files are never stored, vendored builds are forever.
const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./helper');

test('the board never lets a browser keep its own JavaScript', async () => {
  const s = await startServer();
  try {
    const r = await fetch(s.base + '/ui/js/bridge3d/main.js');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.headers.get('cache-control'), 'no-store',
      'a stored copy of our code is a bug report about the wrong thing');
    const html = await fetch(s.base + '/');
    assert.strictEqual(html.headers.get('cache-control'), 'no-store');
  } finally { await s.stop(); }
});

test('a vendored build is kept for a year — its version is in its path', async () => {
  const s = await startServer();
  try {
    const r = await fetch(s.base + '/ui/vendor/three/three.module.min.js');
    assert.strictEqual(r.status, 200);
    const cc = r.headers.get('cache-control');
    assert.match(cc, /max-age=31536000/, 'four megabytes should not be refetched');
    assert.match(cc, /immutable/);
  } finally { await s.stop(); }
});

// There is deliberately no third test here. The interesting boundary — a file
// merely SPELLED like the vendor directory, which a sloppy includes('vendor')
// would cache for a year by accident — has no file in the tree that reaches it,
// so a test for it would pass whatever the code said. The rule is written
// strictly at the source instead. A green light that cannot go red is worse
// than no light at all.
