// sound.js — the room has a sound, and the things in it make one.
//
// Two jobs, and they are not the same job.
//
// **The bed.** One of the five CC0 loops that already ship for the keep-alive
// (`ui/audio/`), played through `ui/js/music.js` — the same fetch, the same
// seamless loop points, the same fade-in. Nothing is reimplemented here: this
// file supplies a context and a destination and gets out of the way. The
// keep-alive's own machinery — the inaudible tone that stops iOS reclaiming a
// silent session — comes along with it and is harmless in a headset.
//
// **The transitions.** Sound in a room carries the moment a thing CHANGES, not
// the state it is in: a press clicks, and the unpress clicks *higher* to say it
// completed; a grab is a muffled closing sound and a release is the same thing
// lower and reversed, so it reads as settling into place. Anything with a place
// in the room is spatialised so it comes from there. A voice with no visible
// source is not, because people hunt for something that is not there.
//
// It is all synthesised — three oscillators and an envelope. A sample per
// interaction would be six more files to fetch for sounds that are 80 ms long.
//
// Nothing starts before a gesture. Every browser refuses audio until the page
// has been touched once, so the whole thing is armed by the same click that
// enters the session.

import { MUSIC_TRACKS, trackUrl } from '../keepalive.js';
import { startMusic } from '../music.js';

// Quiet. This is a bed for a room somebody is working in for an hour, not
// something to notice — and the tracks are levelled to the same -20 LUFS, so
// one number holds for all five.
const BED = 0.16;

// 'drift' is the wide slow one. It has the least happening in it, which is what
// you want behind a surface somebody is reading.
const DEFAULT_TRACK = 'drift';

function placeEars(l, pos, forward, up) {
  if (!l) return;
  if (l.positionX) {
    l.positionX.value = pos.x; l.positionY.value = pos.y; l.positionZ.value = pos.z;
    l.forwardX.value = forward.x; l.forwardY.value = forward.y; l.forwardZ.value = forward.z;
    l.upX.value = up.x; l.upY.value = up.y; l.upZ.value = up.z;
  } else if (l.setPosition) {
    // Safari still ships the deprecated pair and nothing else.
    l.setPosition(pos.x, pos.y, pos.z);
    l.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
  }
}

export class Sound {
  constructor(listener) {
    this.ctx = null;
    this.music = null;
    this.listener = listener || null;   // three's AudioListener, for placing sounds
    this.level = BED;
    this.heard = [];                    // other contexts the ears are also in
  }

  // Another AudioContext whose listener has to follow the head. The speech path
  // (`../speech.js`) owns its own and has to — that context feeds the <audio>
  // the OS sees as a media player, and it is not ours to take over — so a voice
  // panned in THAT graph faces wherever the listener was left, which is the
  // origin looking down -Z, until its ears are moved with these ones.
  alsoHear(ctx) {
    if (ctx && ctx !== this.ctx && !this.heard.includes(ctx)) this.heard.push(ctx);
  }

  // Called from the gesture that enters the room. Safe to call twice.
  start(trackKey) {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    // three's PositionalAudio wants to share our context, so it is handed over
    // rather than left to make a second one — two contexts is two output
    // devices' worth of latency and one of them silent.
    if (this.listener && this.listener.context !== this.ctx) {
      try { this.listener.context = this.ctx; } catch (e) { /* older three */ }
    }
    const key = trackKey || DEFAULT_TRACK;
    const track = MUSIC_TRACKS.find((t) => t.key === key) || MUSIC_TRACKS[0];
    try {
      this.music = startMusic(this.ctx, this.ctx.destination, this.level, trackUrl(track), track.seconds);
      this.track = track.key;
    } catch (e) {
      this.music = null;                // a room with no music is still a room
    }
    return this.ctx;
  }

  // Where the ears are. A panner places a SOURCE in world coordinates; without
  // this the listener stays at the origin facing -Z, so every spatialised sound
  // is correct only while he happens to be looking straight ahead and swings
  // the wrong way the moment he turns. Called from the loop with the camera's
  // own world position and orientation.
  setEars(pos, forward, up) {
    if (this.ctx) placeEars(this.ctx.listener, pos, forward, up);
    for (const c of this.heard) placeEars(c.listener, pos, forward, up);
  }

  setLevel(v) {
    this.level = Math.max(0, Math.min(1, v));
    if (this.music) this.music.setLevel(this.level);
  }

  stop() {
    if (this.music) { this.music.stop(); this.music = null; }
    if (this.ctx) { try { this.ctx.close(); } catch (e) {} this.ctx = null; }
  }

  // ---- the transitions ------------------------------------------------------
  //
  // One envelope, three shapes. `at` is an optional world position: given one,
  // the sound comes from there rather than from everywhere.

  _blip({ hz = 440, to = null, ms = 70, gain = 0.06, type = 'sine', at = null }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(hz, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + ms / 1000);
    // A click with no attack is a click that pops. 6 ms in, the rest decaying.
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    osc.connect(env);
    env.connect(this._sink(at));
    osc.start(t);
    osc.stop(t + ms / 1000 + 0.02);
  }

  // Spatialised when the thing has a place, plain when it does not.
  _sink(at) {
    const ctx = this.ctx;
    if (!at) return ctx.destination;
    const pan = ctx.createPanner();
    pan.panningModel = 'HRTF';
    pan.distanceModel = 'inverse';
    pan.refDistance = 1;
    pan.positionX.value = at.x; pan.positionY.value = at.y; pan.positionZ.value = at.z;
    pan.connect(ctx.destination);
    return pan;
  }

  // Press down, and the press completing. The second is HIGHER — that is the
  // whole grammar: down is a question, up is the answer.
  press(at) { this._blip({ hz: 520, ms: 55, gain: 0.05, at }); }

  released(at) { this._blip({ hz: 780, ms: 60, gain: 0.05, at }); }

  // Closing your hand on something, and letting it settle. Muffled and low,
  // falling on the grab and rising on the release, so the pair reads as picking
  // up and putting down rather than as two identical beeps.
  grab(at) { this._blip({ hz: 220, to: 150, ms: 110, gain: 0.09, type: 'triangle', at }); }

  drop(at) { this._blip({ hz: 150, to: 210, ms: 130, gain: 0.08, type: 'triangle', at }); }

  // A window arriving, and a window going away.
  open(at) { this._blip({ hz: 330, to: 495, ms: 150, gain: 0.06, type: 'sine', at }); }

  close(at) { this._blip({ hz: 440, to: 260, ms: 130, gain: 0.05, type: 'sine', at }); }
}

export { MUSIC_TRACKS };
