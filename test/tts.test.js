'use strict';
// External TTS: config parsing (/api/config) and the proxy's failure paths.
// The contract that matters here is "absent tts = today's behaviour" and "a sick
// engine degrades, never 500s and never hangs" — the UI's fallback to the
// browser voice is built on both.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { startServer, freePort } = require('./helper');

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

test('tts in config: enabled, lang and voice are exposed, the url is not', async () => {
  const s = await startServer({
    seed: seedConfig({ tts: { url: 'http://127.0.0.1:9/', lang: 'pt', voice: null, params: {} } }),
  });
  try {
    const r = await s.api('GET', '/api/config');
    assert.deepEqual(r.body.tts, { enabled: true, lang: 'pt', voice: null });
    assert.ok(!('url' in r.body.tts), 'the engine url must not reach the browser');
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

test('engine unreachable: voices degrade to an empty list, speech answers an error', async () => {
  const dead = await freePort(); // nothing is listening there
  const s = await startServer({ seed: seedConfig({ tts: { url: 'http://127.0.0.1:' + dead, lang: 'pt' } }) });
  try {
    const v = await s.api('GET', '/api/tts/voices');
    assert.equal(v.status, 200, 'never a 500 — the UI has to be able to fall back');
    assert.deepEqual(v.body.voices, []);
    assert.ok(v.body.error, 'the reason comes back with the empty list');

    const sp = await s.api('POST', '/api/tts/speech', { input: 'olá' });
    assert.equal(sp.status, 502);
    assert.ok(sp.body.error);
  } finally { await s.stop(); }
});

test('tts not configured: the proxy says so instead of pretending', async () => {
  const s = await startServer();
  try {
    const v = await s.api('GET', '/api/tts/voices');
    assert.equal(v.status, 200);
    assert.deepEqual(v.body, { voices: [], error: 'tts not configured' });
    const sp = await s.api('POST', '/api/tts/speech', { input: 'olá' });
    assert.equal(sp.status, 503);
  } finally { await s.stop(); }
});

test('engine 400: the status and body reach the browser verbatim', async () => {
  const engine = http.createServer((req, res) => {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ detail: 'input must not be empty' }));
  });
  const port = await freePort();
  await new Promise((r) => engine.listen(port, '127.0.0.1', r));
  const s = await startServer({ seed: seedConfig({ tts: { url: 'http://127.0.0.1:' + port } }) });
  try {
    const sp = await s.api('POST', '/api/tts/speech', { input: ' ' });
    assert.equal(sp.status, 400);
    assert.match(sp.body.detail, /empty/);
  } finally { await s.stop(); engine.close(); }
});

test('engine 200: audio bytes and x-sample-rate stream through, defaults filled in', async () => {
  let seen = null;
  const engine = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'x-sample-rate': '22050' });
      res.end(Buffer.from('RIFFfake'));
    });
  });
  const port = await freePort();
  await new Promise((r) => engine.listen(port, '127.0.0.1', r));
  const s = await startServer({
    seed: seedConfig({ tts: { url: 'http://127.0.0.1:' + port, lang: 'pt', params: { speed: 1.2 } } }),
  });
  try {
    const res = await fetch(s.base + '/api/tts/speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: 'olá, capitão', stream: false }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'audio/wav');
    assert.equal(res.headers.get('x-sample-rate'), '22050');
    assert.equal(Buffer.from(await res.arrayBuffer()).toString(), 'RIFFfake');
    assert.equal(seen.input, 'olá, capitão');
    assert.equal(seen.lang, 'pt', 'the workspace default fills in');
    assert.deepEqual(seen.params, { speed: 1.2 });
    assert.equal(seen.stream, false, 'stream passes through untouched');
  } finally { await s.stop(); engine.close(); }
});

test('an explicit voice wins and suppresses the default lang (they must agree)', async () => {
  let seen = null;
  const engine = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'audio/wav' });
      res.end(Buffer.from('x'));
    });
  });
  const port = await freePort();
  await new Promise((r) => engine.listen(port, '127.0.0.1', r));
  const s = await startServer({
    seed: seedConfig({ tts: { url: 'http://127.0.0.1:' + port, lang: 'pt', voice: 'cfg-voice' } }),
  });
  try {
    await s.api('POST', '/api/tts/speech', { input: 'olá', voice: 'pt_BR-faber-medium' });
    assert.equal(seen.voice, 'pt_BR-faber-medium');
    assert.ok(!('lang' in seen), 'no lang alongside an explicit voice');
  } finally { await s.stop(); engine.close(); }
});
