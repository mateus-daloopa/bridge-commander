// Speaker over an external TTS engine, reached through the server's proxy
// (/api/tts/voices, /api/tts/speech — the engines send no CORS headers).
//
// Every failure rejects: network, non-200, empty body, a blocked or failed
// play(). Nothing here knows what happens next — that is withFallback's job.

export function remoteSpeaker(cfg) {
  const lang = (cfg && cfg.lang) || '';
  let audio = null;
  let gen = 0;                                  // bumped by cancel(); stale work stops quietly

  function stop() {
    if (!audio) return;
    const a = audio; audio = null;
    try { a.pause(); a.src = ''; } catch (e) {}
  }
  function post(input, voice) {
    return fetch('/api/tts/speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(voice ? { input, voice } : { input }),
    });
  }
  return {
    id: 'remote',
    key: 'bc-tts-voice',                        // deliberately NOT the browser key: a
                                                // browser voice name is never an engine id
    voices() {
      return fetch('/api/tts/voices')
        .then((r) => r.json())
        .then((j) => ((j && j.voices) || [])
          .filter((v) => !lang || !Array.isArray(v.langs) || v.langs.includes(lang))
          .map((v) => ({ id: v.id, name: v.name, lang: (v.langs || []).join(',') || lang })))
        .catch(() => []);
    },
    async speak(text, opts) {
      const my = ++gen;
      const voice = (opts && opts.voice) || '';
      let r = await post(text, voice);
      // A voice the engine lists but cannot actually use is a 400 (the catalogue
      // is shared across engines). Retry once on the engine's own default rather
      // than dropping all the way back to the browser voice.
      if (r.status === 400 && voice) r = await post(text, '');
      if (!r.ok) throw new Error('tts http ' + r.status);
      const blob = await r.blob();
      if (!blob.size) throw new Error('tts empty audio');
      if (my !== gen) return;                   // superseded while synthesizing
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      audio = a;
      try {
        await a.play();
        await new Promise((resolve, reject) => {
          a.onended = resolve;
          a.onpause = resolve;                  // cancel(): finished, not failed
          a.onerror = () => reject(new Error('tts playback failed'));
        });
      } finally {
        URL.revokeObjectURL(url);
        if (audio === a) audio = null;
      }
    },
    cancel() { gen++; stop(); },
  };
}
