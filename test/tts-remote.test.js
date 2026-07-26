'use strict';
// ui/js/tts/remote.js — the streaming speaker. Two rules carry the feature:
// sound starts on the first chunk rather than at the end of synthesis, and a
// 400 from an engine that cannot stream is an ANSWER — the same engine is asked
// again without streaming, never dropped straight to the browser voice.
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

test('an engine that cannot stream: the SAME engine is asked again, non-streaming', async () => {
  fakeAudioContext();
  let playedUrl = null;
  global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
  global.Audio = function (url) {
    playedUrl = url;
    setTimeout(() => this.onended && this.onended(), 1);
    return this;
  };
  global.Audio.prototype.play = function () { return Promise.resolve(); };
  const posts = fakeFetch((body) => (body.stream
    ? new Response(JSON.stringify({ detail: 'this engine cannot stream' }), { status: 400 })
    : new Response(Buffer.from('RIFFfake'), { status: 200, headers: { 'content-type': 'audio/wav' } })));
  await remoteSpeaker({}).speak('olá', { voice: 'ana' });
  assert.deepEqual(posts, [
    { input: 'olá', voice: 'ana', stream: true },   // asked to stream
    { input: 'olá', stream: true },                 // maybe it was the voice — same engine, default voice
    { input: 'olá', voice: 'ana' },                 // no: it does not stream. Still this engine.
  ], 'a non-streaming engine must not fall through to the browser voice');
  assert.equal(playedUrl, 'blob:x', 'and it actually spoke');
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

// The catalogue is not filtered by the workspace language: voxcpm2 clones from
// any reference clip, so an `en` voice speaking Portuguese is a choice with an
// accent, not an error. Hiding two thirds of the catalogue was the bug.
test('voices(): the whole catalogue comes back, whatever the workspace language', async () => {
  global.fetch = () => Promise.resolve(new Response(JSON.stringify({ voices: [
    { id: 'a', name: 'Ana', langs: ['pt'] },
    { id: 'b', name: 'Bell', langs: ['en'] },
    { id: 'c', name: 'Chen', langs: ['zh'] },
    { id: 'd', name: 'Dee' },
  ] }), { status: 200 }));
  const list = await remoteSpeaker({ lang: 'pt' }).voices();
  assert.deepEqual(list, [
    { id: 'a', name: 'Ana', lang: 'pt' },
    { id: 'b', name: 'Bell', lang: 'en' },
    { id: 'c', name: 'Chen', lang: 'zh' },
    { id: 'd', name: 'Dee', lang: 'pt' },     // no langs at all: labelled with the default
  ]);
});
