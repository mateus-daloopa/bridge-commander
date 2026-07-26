'use strict';
// ui/js/tts/remote.js — the streaming speaker, and the only playback path there
// is: sound starts on the first chunk rather than at the end of synthesis.
// Anything that is not a stream rejects, and withFallback takes it from there.
// Browser code (ES module), loaded via dynamic import; nothing here touches DOM.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let remoteSpeaker;
test.before(async () => {
  ({ remoteSpeaker } =
    await import(pathToFileURL(path.join(__dirname, '..', 'ui', 'js', 'tts', 'remote.js')).href));
});

// A recording AudioContext: every scheduled buffer, with the time it starts.
function fakeAudioContext() {
  const scheduled = [];
  let closed = false;
  class Ctx {
    constructor(opts) { this.sampleRate = opts && opts.sampleRate; this.state = 'running'; this.destination = {}; }
    get currentTime() { return 0; }
    resume() { return Promise.resolve(); }
    close() { closed = true; return Promise.resolve(); }
    createBuffer(ch, len, rate) {
      const data = new Float32Array(len);
      return { length: len, duration: len / rate, getChannelData: () => data };
    }
    createBufferSource() {
      let ended = false, cb = null;
      return {
        connect() {},
        start(at) { scheduled.push({ at, buffer: this.buffer }); setTimeout(() => { ended = true; if (cb) cb(); }, 1); },
        set onended(f) { cb = f; if (ended) f(); },
        get onended() { return cb; },
      };
    }
  }
  global.window = { AudioContext: Ctx };
  return { scheduled, closed: () => closed };
}

// PCM body: signed 16-bit LE, handed over in `chunks` pieces (a chunk may end
// mid-sample, which is exactly what the engine does).
function pcmResponse(samples, chunkBytes, rate) {
  const buf = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => buf.writeInt16LE(v, i * 2));
  const stream = new ReadableStream({
    start(c) {
      for (let i = 0; i < buf.length; i += chunkBytes) c.enqueue(new Uint8Array(buf.subarray(i, i + chunkBytes)));
      c.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'x-sample-rate': String(rate) } });
}

// Records every speech request (url, body, signal); `answer` decides what each
// one gets. The requests go to the ENGINE now — nothing here is a board route.
function fakeFetch(answer) {
  const posts = [];
  global.fetch = (url, opts) => {
    const body = JSON.parse(opts.body);
    posts.push(Object.assign({ url, signal: opts.signal }, body));
    // A real fetch rejects when its signal fires, however far along it is.
    return Promise.race([
      answer(body, posts.length),
      new Promise((_, rej) => opts.signal.addEventListener('abort',
        () => rej(new DOMException('aborted', 'AbortError')))),
    ]);
  };
  return posts;
}
// The body alone, for the request-shape assertions.
const bodies = (posts) => posts.map(({ url, signal, ...b }) => b);

test('a streaming engine: chunks play back to back, and speak() resolves at the end', async () => {
  const audio = fakeAudioContext();
  const posts = fakeFetch(() => pcmResponse([0, 16384, -16384, 32767, -32768, 0, 100, -100], 5, 24000));
  await remoteSpeaker({ url: 'http://127.0.0.1:8883' }).speak('olá, capitão', {});
  assert.deepEqual(bodies(posts), [{ input: 'olá, capitão', stream: true }], 'one request, streaming');
  assert.equal(posts[0].url, 'http://127.0.0.1:8883/v1/audio/speech', 'straight to the engine');
  const total = audio.scheduled.reduce((n, s) => n + s.buffer.length, 0);
  assert.equal(total, 8, 'every sample played, including the one split across a chunk boundary');
  // Back to back: each buffer starts exactly where the previous one ended.
  let at = audio.scheduled[0].at;
  for (const s of audio.scheduled) {
    assert.ok(Math.abs(s.at - at) < 1e-9, 'gap or overlap at a chunk seam');
    at += s.buffer.length / 24000;
  }
  assert.ok(audio.closed(), 'the context is closed when the message is done');
});

test('a voice the engine cannot use: retried once on its own default, same engine', async () => {
  const audio = fakeAudioContext();
  const posts = fakeFetch((body) => (body.voice
    ? new Response(JSON.stringify({ detail: 'unknown voice' }), { status: 400 })
    : pcmResponse([0, 100, -100, 0], 8, 24000)));
  await remoteSpeaker({ lang: 'pt' }).speak('olá', { voice: 'ana' });
  assert.deepEqual(bodies(posts), [
    { input: 'olá', stream: true, voice: 'ana' },
    { input: 'olá', stream: true, lang: 'pt' },   // the catalogue is shared: try the language
  ]);
  assert.ok(audio.scheduled.length, 'and it spoke');
});

// What the proxy used to fill in on the way past. voice implies lang for the
// engine, so they are never sent together.
test('the workspace defaults are filled in here now', async () => {
  fakeAudioContext();
  const cfg = { url: 'http://e', lang: 'pt', voice: 'cfg-voice', params: { speed: 1.2 } };
  let posts = fakeFetch(() => pcmResponse([0, 100], 4, 24000));
  await remoteSpeaker(cfg).speak('olá', {});
  assert.deepEqual(bodies(posts), [{ input: 'olá', stream: true, voice: 'cfg-voice', params: { speed: 1.2 } }]);

  posts = fakeFetch(() => pcmResponse([0, 100], 4, 24000));
  await remoteSpeaker(cfg).speak('olá', { voice: 'picked' });
  assert.deepEqual(bodies(posts), [{ input: 'olá', stream: true, voice: 'picked', params: { speed: 1.2 } }],
    'a picked voice wins over the workspace default');

  posts = fakeFetch(() => pcmResponse([0, 100], 4, 24000));
  await remoteSpeaker({ url: 'http://e', lang: 'pt' }).speak('olá', {});
  assert.deepEqual(bodies(posts), [{ input: 'olá', stream: true, lang: 'pt' }],
    'no voice anywhere: the language goes instead, never both');
});

// An engine that cannot stream is deliberately NOT handled: it rejects, and
// withFallback hands the message to the browser voice.
test('an engine that cannot stream rejects instead of growing a second playback path', async () => {
  fakeAudioContext();
  fakeFetch(() => new Response(JSON.stringify({ detail: 'this engine cannot stream' }), { status: 400 }));
  await assert.rejects(() => remoteSpeaker({}).speak('olá', {}));
});

test('a 200 without x-sample-rate is not audio we can play: reject, do not guess', async () => {
  fakeAudioContext();
  fakeFetch(() => new Response(Buffer.from('RIFFfake'), { status: 200, headers: { 'content-type': 'audio/wav' } }));
  await assert.rejects(() => remoteSpeaker({}).speak('olá', {}), /did not stream/);
});

test('a stream that dies mid-message rejects, so the fallback speaks the rest', async () => {
  fakeAudioContext();
  fakeFetch(() => new Response(new ReadableStream({
    start(c) { c.enqueue(new Uint8Array([0, 1, 0, 1])); c.error(new Error('engine crashed')); },
  }), { status: 200, headers: { 'x-sample-rate': '24000' } }));
  await assert.rejects(() => remoteSpeaker({}).speak('olá', {}), 'silence is not an outcome');
});

// The proxy used to abort the engine when the listener hung up. With the proxy
// gone the browser's own AbortController is the only thing that can: an
// abandoned synthesis keeps the GPU busy for another half-minute, and voxcpm2
// dies for good when that overlaps the next request.
test('cancel() mid-stream aborts the ENGINE request, and settles speak()', async () => {
  fakeAudioContext();
  let stall;
  const posts = fakeFetch(() => new Response(new ReadableStream({
    start(c) { c.enqueue(new Uint8Array([0, 1, 0, 1])); stall = c; },   // never closes on its own
  }), { status: 200, headers: { 'x-sample-rate': '24000' } }));
  const s = remoteSpeaker({ url: 'http://e' });
  const done = s.speak('olá', {});
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(posts[0].signal.aborted, false, 'still synthesizing');
  s.cancel();
  await done;                                       // cancelled is finished, not failed
  assert.ok(stall, 'the body was still open when cancel() cut it');
  assert.ok(posts[0].signal.aborted, 'the abort has to reach the GPU, not just the speaker');
});

// Same reason, one beat earlier: cancelled before the first byte, while the
// engine is still synthesizing and there is no body to read yet.
test('cancel() before the first chunk aborts too, and does not wake the fallback', async () => {
  fakeAudioContext();
  const posts = fakeFetch(() => new Promise(() => {}));   // the engine never answers
  const s = remoteSpeaker({ url: 'http://e' });
  const done = s.speak('olá', {});
  await new Promise((r) => setTimeout(r, 10));
  s.cancel();
  await done;                                       // must NOT reject: withFallback would speak it again
  assert.ok(posts[0].signal.aborted);
});

// A superseding message is the same shape as the stop button, and the one that
// kills voxcpm2 in practice: the old synthesis has to die before the new one runs.
test('a new message aborts the one it supersedes', async () => {
  fakeAudioContext();
  const posts = fakeFetch((body) => (body.input === 'first'
    ? new Promise(() => {})
    : pcmResponse([0, 100], 4, 24000)));
  const s = remoteSpeaker({ url: 'http://e' });
  const first = s.speak('first', {});
  await new Promise((r) => setTimeout(r, 10));
  await s.speak('second', {});
  await first;
  assert.ok(posts[0].signal.aborted, 'the superseded request was cut at the engine');
  assert.equal(posts[1].signal.aborted, false);
});

// The catalogue is not filtered by the workspace language: voxcpm2 clones from
// any reference clip, so an `en` voice speaking Portuguese is a choice with an
// accent, not an error. Hiding two thirds of the catalogue was the bug.
test('voices(): the whole catalogue comes back, whatever the workspace language', async () => {
  let asked = null;
  global.fetch = (u) => (asked = u) && Promise.resolve(new Response(JSON.stringify({ voices: [
    { id: 'a', name: 'Ana', langs: ['pt'] },
    { id: 'b', name: 'Bell', langs: ['en'] },
    { id: 'c', name: 'Chen', langs: ['zh'] },
    { id: 'd', name: 'Dee' },
  ] }), { status: 200 }));
  const list = await remoteSpeaker({ url: 'http://127.0.0.1:8883', lang: 'pt' }).voices();
  assert.equal(asked, 'http://127.0.0.1:8883/v1/voices', 'the engine, not the board');
  assert.deepEqual(list, [
    { id: 'a', name: 'Ana', lang: 'pt' },
    { id: 'b', name: 'Bell', lang: 'en' },
    { id: 'c', name: 'Chen', lang: 'zh' },
    { id: 'd', name: 'Dee', lang: 'pt' },     // no langs at all: labelled with the default
  ]);
});
