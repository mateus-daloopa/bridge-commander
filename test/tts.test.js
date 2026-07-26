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

// ---------- the speech deadline ----------
// It is a deadline on SILENCE, not on the whole request, and it is set low here
// (BC_TTS_SPEECH_MS) so the tests take seconds instead of the real half-minute.
//
// A streaming engine emits for as long as it synthesizes — 34 s of chunks for the
// 1200 characters the UI sends. Only a gap between chunks is a broken engine.
test('a stream may run past the deadline while chunks keep arriving, and is cut when they stop', async () => {
  const port = await freePort();
  const engine = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const n = JSON.parse(body).input === 'stall' ? 1 : 8;   // 8 chunks, 400 ms apart = 3.2 s
      res.writeHead(200, { 'Content-Type': 'audio/pcm', 'x-sample-rate': '24000' });
      let i = 0;
      const t = setInterval(() => {
        res.write(Buffer.alloc(100, 7));
        if (++i >= n) { clearInterval(t); if (n > 1) res.end(); }   // 'stall': never ends
      }, 400);
    });
  });
  await new Promise((r) => engine.listen(port, '127.0.0.1', r));
  const s = await startServer({
    seed: seedConfig({ tts: { url: 'http://127.0.0.1:' + port, lang: 'pt' } }),
    env: { BC_TTS_SPEECH_MS: '1000' },          // 1 s of silence is the limit, per chunk
  });
  try {
    const ok = await s.api('POST', '/api/tts/speech', { input: 'oi', stream: true });
    assert.equal(ok.body.length, 800, '3.2 s of chunks under a 1 s per-chunk deadline: all of it');
    const cut = await s.api('POST', '/api/tts/speech', { input: 'stall', stream: true });
    assert.equal(cut.body.length, 100, 'a stream that goes silent is still cut off');
  } finally { await s.stop(); engine.close(); }
});

// Cancel has to reach the GPU. A listener who hits stop (or a newer message that
// supersedes this one) leaves the engine synthesizing for another half-minute
// otherwise — and voxcpm2 dies outright when that abandoned message overlaps the
// next request, which is exactly the shape of cancel-then-speak.
test('the listener hangs up: the engine request is aborted, not left running', async () => {
  const port = await freePort();
  let closed = null;
  const engine = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'audio/pcm', 'x-sample-rate': '24000' });
      let sent = 0;
      const t = setInterval(() => { res.write(Buffer.alloc(100, 7)); sent++; }, 100);
      res.on('close', () => { clearInterval(t); if (closed === null) closed = sent; });
    });
  });
  await new Promise((r) => engine.listen(port, '127.0.0.1', r));
  const s = await startServer({ seed: seedConfig({ tts: { url: 'http://127.0.0.1:' + port, lang: 'pt' } }) });
  try {
    const ac = new AbortController();
    const req = fetch(s.base + '/api/tts/speech', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'olá', stream: true }), signal: ac.signal,
    }).then((r) => r.arrayBuffer());
    await new Promise((r) => setTimeout(r, 500));
    ac.abort();                                 // the browser stops listening
    await req.catch(() => {});
    await new Promise((r) => setTimeout(r, 500));
    assert.ok(closed !== null, 'the engine kept synthesizing for nobody');
    assert.ok(closed < 12, 'it was cut where the listener left, not at the end (' + closed + ' chunks)');
  } finally { await s.stop(); engine.close(); }
});
