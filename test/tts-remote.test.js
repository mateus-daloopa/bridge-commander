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

// Records every /api/tts/speech body; `answer` decides what each one gets.
function fakeFetch(answer) {
  const posts = [];
  global.fetch = (url, opts) => {
    const body = JSON.parse(opts.body);
    posts.push(body);
    return Promise.resolve(answer(body, posts.length));
  };
  return posts;
}

test('a streaming engine: chunks play back to back, and speak() resolves at the end', async () => {
  const audio = fakeAudioContext();
  const posts = fakeFetch(() => pcmResponse([0, 16384, -16384, 32767, -32768, 0, 100, -100], 5, 24000));
  await remoteSpeaker({}).speak('olá, capitão', {});
  assert.deepEqual(posts, [{ input: 'olá, capitão', stream: true }], 'one request, streaming');
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
  await remoteSpeaker({}).speak('olá', { voice: 'ana' });
  assert.deepEqual(posts, [
    { input: 'olá', stream: true, voice: 'ana' },
    { input: 'olá', stream: true },               // the catalogue is shared: try its default
  ]);
  assert.ok(audio.scheduled.length, 'and it spoke');
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

test('cancel() mid-stream settles speak() instead of hanging on a dead context', async () => {
  fakeAudioContext();
  let stall;
  fakeFetch(() => new Response(new ReadableStream({
    start(c) { c.enqueue(new Uint8Array([0, 1, 0, 1])); stall = c; },   // never closes on its own
  }), { status: 200, headers: { 'x-sample-rate': '24000' } }));
  const s = remoteSpeaker({});
  const done = s.speak('olá', {});
  await new Promise((r) => setTimeout(r, 10));
  s.cancel();
  await done;                                       // cancelled is finished, not failed
  assert.ok(stall, 'the body was still open when cancel() cut it');
});
