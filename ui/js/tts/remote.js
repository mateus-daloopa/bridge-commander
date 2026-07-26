// Speaker over an external TTS engine, reached through the server's proxy
// (/api/tts/voices, /api/tts/speech — the engines send no CORS headers).
//
// Speech is asked for STREAMING: the body is then raw signed 16-bit little-endian
// mono PCM (no header, no framing) at the rate in `x-sample-rate`, and it plays as
// it arrives instead of after the whole synthesis. An engine that cannot stream
// says so with a 400 — that is an answer, so we ask the same engine again without
// streaming before giving up on it.
//
// Every failure rejects: network, non-200, empty body, a blocked or failed
// play(). Nothing here knows what happens next — that is withFallback's job.

const LEAD = 0.05;                              // schedule this far ahead of "now"

export function remoteSpeaker(cfg) {
  const lang = (cfg && cfg.lang) || '';
  let audio = null;                             // <audio>, the non-streaming path
  let ctx = null;                               // AudioContext, the streaming path
  let reader = null;                            // the body being read right now
  let endStream = null;                         // resolves the stream awaiting its last buffer
  let gen = 0;                                  // bumped by cancel(); stale work stops quietly

  function stop() {
    if (audio) { const a = audio; audio = null; try { a.pause(); a.src = ''; } catch (e) {} }
    if (reader) { const rd = reader; reader = null; try { rd.cancel(); } catch (e) {} }
    if (ctx) { const c = ctx; ctx = null; try { c.close(); } catch (e) {} }
    const done = endStream; endStream = null;
    if (done) done();                           // a cancelled message is finished, not failed
  }
  function post(input, voice, stream) {
    const body = { input };
    if (voice) body.voice = voice;
    if (stream) body.stream = true;
    return fetch('/api/tts/speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // Play raw PCM as it arrives, buffer scheduled back to back so the seams are
  // silent. Resolves when the last one has finished, rejects if the stream dies.
  async function playStream(res, rate, my) {
    const c = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: rate });
    ctx = c;
    // Audio the page has not been allowed to make yet: resume() then waits for a
    // gesture that may never come, so it is raced rather than awaited — a context
    // that is not running is a failure, and failure is what withFallback reads.
    if (c.state !== 'running') {
      await Promise.race([c.resume().catch(() => {}), new Promise((r) => setTimeout(r, 250))]);
      if (c.state !== 'running') throw new Error('tts audio blocked');
    }
    const rd = res.body.getReader();
    reader = rd;
    try {
      let at = 0;                               // when the next buffer starts, on c's clock
      let odd = null;                           // a chunk can end mid-sample: carry the byte over
      let last = null;
      for (;;) {
        const { value, done } = await rd.read();
        if (done || my !== gen) break;
        let bytes = value;
        if (odd) { const j = new Uint8Array(odd.length + bytes.length); j.set(odd); j.set(bytes, odd.length); bytes = j; }
        odd = bytes.length % 2 ? bytes.slice(-1) : null;
        bytes = odd ? bytes.slice(0, -1) : bytes.slice();  // copy: Int16Array needs its own aligned buffer
        if (!bytes.length) continue;
        const pcm = new Int16Array(bytes.buffer);
        const buf = c.createBuffer(1, pcm.length, rate);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
        const src = c.createBufferSource();
        src.buffer = buf;
        src.connect(c.destination);
        at = Math.max(at, c.currentTime + LEAD); // never schedule in the past (a slow engine underruns)
        src.start(at);
        at += buf.duration;
        last = src;
      }
      if (my !== gen) return;                   // cancelled: stop() already tore the context down
      if (!last) throw new Error('tts empty audio');
      await new Promise((resolve) => { endStream = resolve; last.onended = resolve; });
    } finally {
      endStream = null;
      if (reader === rd) reader = null;
      if (ctx === c) { ctx = null; try { c.close(); } catch (e) {} }
    }
  }

  async function playBlob(res, my) {
    const blob = await res.blob();
    if (!blob.size) throw new Error('tts empty audio');
    if (my !== gen) return;                     // superseded while synthesizing
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    audio = a;
    try {
      await a.play();
      await new Promise((resolve, reject) => {
        a.onended = resolve;
        a.onpause = resolve;                    // cancel(): finished, not failed
        a.onerror = () => reject(new Error('tts playback failed'));
      });
    } finally {
      URL.revokeObjectURL(url);
      if (audio === a) audio = null;
    }
  }

  return {
    id: 'remote',
    key: 'bc-tts-voice',                        // deliberately NOT the browser key: a
                                                // browser voice name is never an engine id
    // The whole catalogue, in the engine's own order. It used to be filtered to
    // the workspace language, which hid 145 of 221 voices for one assumption that
    // is not true of a cloning engine: a reference clip tagged `en` speaks
    // Portuguese fine, it just brings an accent. Picking a voice is the captain's
    // ear, not ours — the language is on the label so he can see what he is picking.
    voices() {
      return fetch('/api/tts/voices')
        .then((r) => r.json())
        .then((j) => ((j && j.voices) || [])
          .map((v) => ({ id: v.id, name: v.name, lang: (v.langs || []).join(',') || lang })))
        .catch(() => []);
    },
    async speak(text, opts) {
      const my = ++gen;
      stop();                                   // a new message supersedes the old one, sound and all
      const voice = (opts && opts.voice) || '';
      // A 400 is the engine answering, not failing, and there are two answers worth
      // retrying: a voice it lists but cannot use (the catalogue is shared across
      // engines), and "I do not stream". Streaming first, this engine to the end.
      let r;
      for (const stream of [true, false]) {
        r = await post(text, voice, stream);
        if (r.status === 400 && voice) r = await post(text, '', stream);
        if (r.status !== 400) break;
      }
      if (!r.ok) throw new Error('tts http ' + r.status);
      const rate = Number(r.headers.get('x-sample-rate'));
      return rate ? playStream(r, rate, my) : playBlob(r, my);
    },
    cancel() { gen++; stop(); },
  };
}
