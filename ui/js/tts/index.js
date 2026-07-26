// The speaker seam. One interface, two implementations, one composition:
//
//   { id, key, voices(), speak(text, {voice, who}), cancel() }
//
// `who` is the author of what is being spoken. The browser speaker ignores it;
// the remote one shows it on the lock screen, because a phone with its screen
// off is exactly where "who is talking" stops being obvious.
//
// voices() answers [{id, name, lang}] whatever is behind it — a browser voice's
// name|lang pair and an engine voice's opaque id both come out as an `id`, so
// nothing downstream knows the difference. speak() rejects on failure.
//
// This module is the ONLY place that knows a remote failure means "use the
// browser": speakerFor() composes it once, and voice.js holds a single speaker
// it never questions.
import { browserSpeaker } from './browser.js';
import { remoteSpeaker } from './remote.js';

// speak() tries `primary` and, if it rejects, speaks the same text through
// `secondary` — so the board never loses its voice when an engine is down.
// The secondary is spoken with NO voice option: the picked id belongs to the
// primary and would be meaningless (or wrong) to the other side.
export function withFallback(primary, secondary) {
  return {
    id: primary.id,
    key: primary.key,
    voices: () => primary.voices(),
    speak: (text, opts) => primary.speak(text, opts).catch(() => secondary.speak(text, {})),
    cancel: () => { primary.cancel(); secondary.cancel(); },
  };
}

// Build the speaker for a workspace config (/api/config). No external engine
// configured => the browser speaker alone, exactly as it always was.
export function speakerFor(cfg) {
  const tts = cfg && cfg.tts;
  const browser = browserSpeaker();
  if (!tts || !tts.enabled) return browser;
  return withFallback(remoteSpeaker(tts), browser);
}
