// talk.js — press and hold, and the room writes down what he said.
//
// The system keyboard takes Quest Browser down (MNC-87), so this is the only
// way to put a sentence into a lieutenant's chat from inside the room. The
// whole flow was proven on `ui/stt-test.html` first and this is that page's
// engine half, with the bench parts taken out: one take at a time, the
// websocket only, and every failure handed back as a line somebody else can
// draw in front of his face.
//
// **It imports nothing.** Not three, not uikit, not voice.js. That is
// deliberate — the state machine below is the part that can be wrong in a way
// no screenshot shows, and a module with no imports is one a test can load and
// drive with a stub socket. What it needs from the rest of the room (silencing
// the crew) arrives through `setHush`.
//
// ## The microphone is acquired at the gate, and kept
//
// A permission prompt is a browser surface, and there is nowhere to put one
// inside an immersive session — asking mid-session suspends or ends it. So
// `arm()` runs on the flat page, inside the press that enters, and the stream
// it gets is held for the whole visit rather than opened per utterance. That
// costs a microphone indicator standing for as long as he is in the room, and
// buys the guarantee that nothing in here can ever raise a prompt he cannot
// see.
//
// ## One take
//
//   begin() → 'recording' → end() → 'settling' → 'heard'
//                                              ↘ 'error'
//
// The engine sends the transcript of everything so far rather than the newest
// words, so `text` is replaced and never appended. The first message that
// arrives after the recorder has flushed is the final one — same rule the
// bench page uses, and the reason `end()` and `drop()` are separate verbs.

const PREFIX = '/api/stt';
// How long a stop is given to produce a final before we call it. The bench
// measured stop→final in the low hundreds of milliseconds; this is the number
// at which he is entitled to be told nothing came back.
const FINAL_MS = 12000;
// A chunk a second, the cadence the engine was benched at.
const CHUNK_MS = 1000;

let stream = null;       // the gate's microphone, held for the visit
let denied = '';         // why there is no microphone, in words he can read
let take = null;         // the one utterance in flight, or null
let hush = null;         // told when he starts and stops talking

// The room hands in what to do about the crew's own voices while he is
// speaking — see voice3d.js. A file about a microphone has no business
// importing the speech queue.
export function setHush(fn) { hush = fn || null; }

export function armed() { return !!stream; }
export function armedWhy() { return denied; }

// Called from the gate, inside the press that enters. Returns '' when the
// microphone is here, and the reason it is not otherwise — never throws, because
// a refused microphone must not be the thing that stops him entering the room.
export async function arm() {
  if (stream) return '';
  const md = typeof navigator !== 'undefined' && navigator.mediaDevices;
  if (!md || !md.getUserMedia) {
    denied = 'this browser has no microphone API';
    return denied;
  }
  try {
    stream = await md.getUserMedia({ audio: true });
    denied = '';
  } catch (e) {
    stream = null;
    denied = why(e);
  }
  return denied;
}

// He left the room. The microphone goes with him — the gate is a flat page and
// asking again there is free, so there is no reason to leave a capture
// indicator standing on a headset he has taken off.
export function disarm() {
  drop();
  if (stream) { for (const t of stream.getTracks()) { try { t.stop(); } catch (e) {} } }
  stream = null;
}

// What is happening, for whoever is drawing it: 'idle', 'recording',
// 'settling', 'heard' or 'error'.
export function state() { return take ? take.state : 'idle'; }

// The finished transcript, or '' if there is not one yet.
export function heard() {
  return take && take.state === 'heard' ? take.text.trim() : '';
}

// Start a take. `onUpdate({state, text, why})` is called on every change,
// including the first — so the surface that started this never has to guess
// what it is showing.
export function begin(onUpdate) {
  drop();
  const t = {
    state: 'recording', text: '', why: '', rec: null, ws: null, timer: null,
    pending: false, hushed: false, onUpdate,
  };
  take = t;
  if (hush) { hush(true); t.hushed = true; }
  push(t);

  if (!stream) return fail(t, denied || 'the microphone was never asked for at the gate');

  let ws;
  try {
    ws = new WebSocket(wsUrl());
  } catch (e) { return fail(t, 'the transcription socket refused: ' + why(e)); }
  t.ws = ws;

  ws.onopen = () => {
    if (t !== take) { try { ws.close(); } catch (e) {} return; }
    let rec;
    try {
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? { mimeType: 'audio/webm' } : {};
      rec = new MediaRecorder(stream, mime);
    } catch (e) { return fail(t, 'the recorder refused: ' + why(e)); }
    t.rec = rec;
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size && ws.readyState === 1) ws.send(e.data);
    };
    rec.onerror = (e) => fail(t, 'the recorder stopped: ' + why(e && e.error ? e.error : e));
    rec.start(CHUNK_MS);
    // He let go before the socket finished opening — a short utterance is the
    // normal case, not an edge one, so the stop is remembered and run here.
    if (t.pending) flush(t);
  };

  ws.onmessage = (e) => {
    if (t !== take || t.state === 'heard' || t.state === 'error') return;
    let d;
    try { d = JSON.parse(e.data); } catch (err) { return; }   // not ours to interpret
    if (d.error) return fail(t, 'the engine: ' + d.error);
    if (typeof d.text === 'string') t.text = d.text;
    // The first thing said after the flush is the final one.
    if (t.state === 'settling') return settle(t);
    push(t);
  };

  ws.onerror = () => {
    if (t === take && (t.state === 'recording' || t.state === 'settling')) {
      fail(t, 'the transcription engine did not answer — no stt configured on this board?');
    }
  };
  ws.onclose = () => {
    if (t === take && (t.state === 'recording' || t.state === 'settling')) {
      fail(t, 'the transcription socket closed mid-sentence');
    }
  };
}

// He let go. Safe to call at any time from anywhere — the room wires it to
// every way a press can end, because a recording that never stops is the one
// failure with no way out from inside a headset.
export function end() {
  const t = take;
  if (!t || t.state !== 'recording') return;
  unhush(t);                                   // he has stopped: the crew may speak again
  if (!t.rec) { t.pending = true; return; }    // the socket is still opening
  flush(t);
}

// Throw the take away — 'again', a chat closing, or a fresh press.
export function drop() {
  const t = take;
  take = null;
  if (!t) return;
  close(t);
  // Whoever was drawing this one is told it is gone. Without it, a panel he
  // walked away from keeps a dead "listening" on its foot forever — nothing
  // else will ever call it again.
  if (t.onUpdate) t.onUpdate({ state: 'idle', text: '', why: '' });
}

// ---- the machinery ---------------------------------------------------------

function flush(t) {
  t.state = 'settling';
  push(t);
  try { if (t.rec && t.rec.state !== 'inactive') t.rec.stop(); } catch (e) {}   // one last chunk
  t.timer = setTimeout(() => {
    if (t !== take) return;
    if (t.text.trim()) return settle(t);
    fail(t, 'nothing came back from the engine in ' + Math.round(FINAL_MS / 1000) + 's');
  }, FINAL_MS);
}

function settle(t) {
  close(t);
  if (t.text.trim()) t.state = 'heard';
  else { t.state = 'error'; t.why = 'nothing was heard'; }
  push(t);
}

function fail(t, msg) {
  close(t);
  t.state = 'error';
  t.why = msg;
  push(t);
}

// Everything this take is holding, let go of — never the stream, which belongs
// to the visit and cannot be asked for again from inside a session.
function close(t) {
  if (t.timer) { clearTimeout(t.timer); t.timer = null; }
  unhush(t);      // every way a take can die, including the ones nobody planned
  try { if (t.rec && t.rec.state !== 'inactive') t.rec.stop(); } catch (e) {}
  try { if (t.ws) t.ws.close(); } catch (e) {}
}

// A crew left mute because a socket died mid-sentence is a room that never
// speaks again, and there is no toggle in here to fix it with.
function unhush(t) {
  if (!t.hushed) return;
  t.hushed = false;
  if (hush) hush(false);
}

function push(t) {
  if (t !== take || !t.onUpdate) return;
  t.onUpdate({ state: t.state, text: t.text, why: t.why });
}

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return proto + '//' + location.host + PREFIX + '/ws/transcribe';
}

function why(e) { return String((e && e.message) || e); }
