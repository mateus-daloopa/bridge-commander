'use strict';
// External TTS: all the server does now is parse the tts block and hand it to the
// browser through /api/config. The browser talks to the engine itself, so the
// only contracts here are "absent tts = today's behaviour" and "a configured
// engine reaches the client whole, url included".
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { startServer } = require('./helper');

// Seed <dir>/.bridge-commander/config.json before the server boots.
function seedConfig(cfg) {
  return (dir) => {
    const sd = path.join(dir, '.bridge-commander');
    fs.mkdirSync(sd, { recursive: true });
    fs.writeFileSync(path.join(sd, 'config.json'), JSON.stringify(cfg));
  };
}

test('no tts in config: /api/config is unchanged', async () => {
  const s = await startServer({ seed: seedConfig({ voices: ['Luciana'] }) });
  try {
    const r = await s.api('GET', '/api/config');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { voices: ['Luciana'] });
    assert.ok(!('tts' in r.body));
  } finally { await s.stop(); }
});

// The url used to be withheld deliberately. That reverses: the browser is the
// engine's client now, and a client without an address cannot call anyone.
test('tts in config: the whole block reaches the browser, url and defaults included', async () => {
  const s = await startServer({
    seed: seedConfig({ tts: { url: 'http://127.0.0.1:8883/', lang: 'pt', voice: null, params: { speed: 1.2 } } }),
  });
  try {
    const r = await s.api('GET', '/api/config');
    assert.deepEqual(r.body.tts, {
      enabled: true,
      url: 'http://127.0.0.1:8883',              // trailing slash trimmed: the browser appends /v1/...
      lang: 'pt',
      voice: null,
      params: { speed: 1.2 },
    });
  } finally { await s.stop(); }
});

test('malformed tts config reads as not configured', async () => {
  for (const tts of [{ lang: 'pt' }, { url: '' }, 'nope', []]) {
    const s = await startServer({ seed: seedConfig({ tts }) });
    try {
      const r = await s.api('GET', '/api/config');
      assert.ok(!('tts' in r.body), 'tts=' + JSON.stringify(tts) + ' should be off');
    } finally { await s.stop(); }
  }
});

// The proxy is gone. Nothing should answer where it used to live — a route that
// half-exists is worse than one that does not.
test('the proxy routes are gone', async () => {
  const s = await startServer({ seed: seedConfig({ tts: { url: 'http://127.0.0.1:8883', lang: 'pt' } }) });
  try {
    assert.equal((await s.api('GET', '/api/tts/voices')).status, 404);
    assert.equal((await s.api('POST', '/api/tts/speech', { input: 'olá' })).status, 404);
  } finally { await s.stop(); }
});
