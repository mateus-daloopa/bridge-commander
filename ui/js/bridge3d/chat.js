// chat.js — talking to a lieutenant, from inside the room.
//
// This is the thing the captain most wants out of the room, and it is the one
// that decides whether any of it was worth building: everything else here is
// looking, and this is the only part that is TALKING. "O chat com o tenente" —
// the lieutenants are how he works, so a room he cannot speak from is a room he
// will visit once.
//
// The panel is `panel.js` with two additions: the thread painted newest at the
// bottom, and a composer in the foot.
//
// **Input, honestly.** uikit's Input owns a real hidden DOM <input>, and a
// browser still delivers keystrokes to the document inside an immersive
// session even though it draws no DOM there. So a paired Bluetooth keyboard
// types into whichever panel was last focused, and Enter sends. There is no
// on-screen keyboard: typing on a floating keyboard in VR is miserable, and a
// half-built one would be worse than saying plainly that a keyboard is
// required. When dictation lands it plugs in here, at `send()`.
//
// Sending is `POST /api/feedback` — the captain side of chat.say. Write-ahead:
// the server queues the delivery before it wakes anybody, so a message never
// depends on a session being alive at the moment it is sent.

import * as W from './world.js';
import { Container, Text, Input, COL, cm, fontFor, inert, safe } from './kit.js';
import { Panel } from './panel.js';
import { Target } from './hover.js';

const D = W.PANEL.distM;

// How much of the thread to paint. A chat here runs to well over a thousand
// messages, and the panel shows fourteen lines — so the tail is what matters
// and the rest is a scroll nobody in a headset wants to do. Enough to hold the
// conversation, few enough that a repaint is not a stall.
const TAIL = 20;

export class ChatPanel extends Panel {
  // `target` is the board's own thread address: `lieutenant:<id>` or
  // `card:<id>`. Deliberately the wire format, so this class never has to know
  // which of the two it is showing.
  constructor({ target, title, subtitle, tint, onClose }) {
    super({ name: 'chat', title, subtitle, tint, onClose });
    this.target = target;
    this.sending = false;
    this._lastPainted = '';

    const pad = W.sizeForArc(1.0, D);
    const barM = W.sizeForArc(W.BUILD.hit, D);

    this.field = new Input({
      flexGrow: 1, height: cm(barM),
      backgroundColor: COL.field, backgroundOpacity: 1, borderRadius: cm(0.010),
      borderWidth: cm(0.0018), borderColor: COL.faint, borderOpacity: 0.6,
      paddingX: cm(pad * 0.7), verticalAlign: 'center',
      fontSize: fontFor(W.TYPE.body, D), color: COL.text, caretColor: COL.accent,
      placeholder: 'type, then enter',
      hover: { borderColor: COL.accent, borderOpacity: 1 },
      onValueChange: (v) => { this.draft = v || ''; },
    });
    this.draft = '';

    const sendBox = new Container({
      width: cm(barM * 1.5), height: cm(barM), flexShrink: 0,
      borderRadius: cm(0.010), backgroundColor: COL.mine, backgroundOpacity: 1,
      justifyContent: 'center', alignItems: 'center',
      hover: { backgroundColor: '#2a5f7a' }, active: { backgroundColor: COL.accent },
    });
    const sendMark = new Text({ text: 'send', fontSize: fontFor(W.TYPE.body, D), color: COL.text });
    inert(sendMark);
    sendBox.add(sendMark);

    this.foot.add(this.field, sendBox);
    this.foot.setProperties({ display: 'flex' });

    const sendTarget = new Target({ mesh: sendBox, name: 'chat-send', onSelect: () => this.send() });
    sendTarget._paint = () => {};
    const fieldTarget = new Target({ mesh: this.field, name: 'chat-field', onSelect: () => this.focus() });
    fieldTarget._paint = () => {};
    this.targets.push(sendTarget, fieldTarget);

    // Enter sends. It has to hang off the hidden element rather than off the
    // window, because the window hears every panel at once and the last thing a
    // room with three chats open needs is a message going to the wrong one.
    const el = this.field.element;
    if (el) {
      el.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.shiftKey) return;
        e.preventDefault();
        this.send();
      });
    }
  }

  focus() {
    if (this.field.element) this.field.element.focus();
  }

  setOpen(on) {
    super.setOpen(on);
    // Opening a chat is an intention to talk, so the composer takes the
    // keyboard without him having to aim at it first.
    if (on) this.focus();
  }

  // Paint the tail of a thread. `messages` is the board's own shape:
  // {author, text, ts}. Cheap-skips when nothing has changed, because this is
  // called from the 5 s refresh and re-laying out forty MSDF paragraphs on a
  // Quest is not free.
  paint(messages) {
    const list = (messages || []).slice(-TAIL);
    const stamp = list.length + '|' + (list.length ? list[list.length - 1].ts : '');
    if (stamp === this._lastPainted) return;
    this._lastPainted = stamp;

    this.clearBody();
    if (!list.length) {
      this.addText('nothing said yet', { size: W.TYPE.meta, color: COL.faint });
      return;
    }
    for (const m of list) {
      const mine = m.author === 'user';
      // Who, once, small — not on every line and never as a second avatar. The
      // colour bar down the side carries it the rest of the way.
      this.addText(
        (mine ? 'you' : (m.author || 'lieutenant')) + '  ' + clock(m.ts),
        { size: W.TYPE.meta, color: COL.faint },
      );
      this.addText(m.text || '', { color: mine ? COL.dim : COL.text });
    }
    this.scrollToEnd();
  }

  // Newest at the bottom, and the panel opens looking at it.
  //
  // It has to wait for a layout pass. uikit only clamps a scroll offset inside
  // its own scroll handler — assigning `scrollPosition` directly is taken at
  // face value, so asking for the end before Yoga has measured the content
  // sends every message a million units off the panel and leaves it looking
  // empty. `maxScrollPosition` is the honest end, and it is not knowable until
  // the paragraphs have been laid out.
  scrollToEnd() { this._toEnd = 3; }

  tick(now) {
    super.tick(now);
    if (!this._toEnd) return;
    const max = this.body.maxScrollPosition && this.body.maxScrollPosition.value;
    if (max && max[1] != null) {
      this.body.scrollPosition.value = [0, max[1]];
      this._toEnd--;                // a couple of passes: the last one sticks
    }
  }

  async send() {
    const text = (this.draft || '').trim();
    if (!text || this.sending) return;
    this.sending = true;
    // Cleared straight away rather than on the response: he has pressed enter,
    // the message is gone as far as he is concerned, and a field that empties
    // half a second later reads as a dropped keystroke.
    this.draft = '';
    this.field.setProperties({ value: '' });
    try {
      const r = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target: this.target, text }),
      });
      if (!r.ok) throw new Error(await r.text());
      // Shown immediately, before the next refresh brings it back from the
      // board — a reply that takes five seconds to appear feels broken even
      // when it is not.
      this.addText('you  ' + clock(new Date().toISOString()), { size: W.TYPE.meta, color: COL.faint });
      this.addText(text, { color: COL.dim });
      this._lastPainted = '';
      this.scrollToEnd();
    } catch (e) {
      this.addText('not sent - ' + ((e && e.message) || e), { size: W.TYPE.meta, color: '#e08a8a' });
    } finally {
      this.sending = false;
      this.focus();
    }
  }
}

// The time, and only the time. A date on every message is noise in a
// conversation you are having right now.
function clock(ts) {
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return '';
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
