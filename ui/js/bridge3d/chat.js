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
// **Input, honestly.** The composer is a `Field` — a surface the room draws and
// paints itself; nothing here is ever rendered by the browser. Two things can
// put characters in it. A paired Bluetooth keyboard delivers keydown to the
// document regardless of focus, main.js hears it at the window, and it goes to
// whichever composer holds the keys — opening a chat is an intention to talk,
// so this one takes them, and Enter sends. And PRESSING the field raises the
// Quest system keyboard, which is where dictation comes from: he speaks, the
// words arrive through the field's `value`, and `send` puts them on the board.
// See keys.js and syskb.js.
//
// The system keyboard has no Enter that reaches us — Done dismisses it and
// nothing is delivered — so the `send` box beside the field is not decoration.
// It is the only way to send a dictated message.
//
// Sending is `POST /api/feedback` — the captain side of chat.say. Write-ahead:
// the server queues the delivery before it wakes anybody, so a message never
// depends on a session being alive at the moment it is sent.

import * as W from './world.js';
import { Container, Text, COL, cm, fontFor, inert, safe } from './kit.js';
import { Panel } from './panel.js';
import { Field } from './field.js';
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

    this.field = new Field({
      box: {
        flexGrow: 1, height: cm(barM), borderRadius: cm(0.010), paddingX: cm(pad * 0.7),
      },
      fontSize: fontFor(W.TYPE.body, D),
      placeholder: 'type, then enter',
      // The panel is 49 characters across and the send button takes a fifth of
      // the foot, so this is what fits beside it.
      chars: 38,
      onSubmit: () => this.send(),
    });

    const sendBox = new Container({
      width: cm(barM * 1.5), height: cm(barM), flexShrink: 0,
      borderRadius: cm(0.010), backgroundColor: COL.mine, backgroundOpacity: 1,
      justifyContent: 'center', alignItems: 'center',
      hover: { backgroundColor: '#2a5f7a' }, active: { backgroundColor: COL.accent },
    });
    const sendMark = new Text({ text: 'send', fontSize: fontFor(W.TYPE.body, D), color: COL.text });
    inert(sendMark);
    sendBox.add(sendMark);

    this.foot.add(this.field.box, sendBox);
    this.foot.setProperties({ display: 'flex' });

    const sendTarget = new Target({ mesh: sendBox, name: 'chat-send', onSelect: () => this.send() });
    sendTarget._paint = () => {};
    const fieldTarget = new Target({
      mesh: this.field.box, name: 'chat-field', onSelect: () => this.field.take(),
    });
    fieldTarget._paint = () => {};
    this.targets.push(sendTarget, fieldTarget);
  }

  setOpen(on) {
    super.setOpen(on);
    // Opening a chat is an intention to talk, so the composer takes the
    // keyboard without him having to aim at it first — and a room with three
    // chats open never has two of them listening, because taking the keys takes
    // them off whoever had them. Closing gives them back to the room, which is
    // what makes `b`/`c`/`x` work again.
    //
    // `raise: false` is the one thing opening does NOT do. Taking the keys is
    // cheap — a caret, a ring, and his bluetooth keyboard live — but raising the
    // system keyboard puts a shell surface in front of the conversation he has
    // just opened and has not asked to write in yet. Pressing the composer is
    // what asks. It is also, not by accident, the one path that used to take the
    // headset out of the session: whatever the room does automatically the
    // instant a panel opens is the worst place to be wrong.
    if (on) this.field.take({ raise: false }); else this.field.release();
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
    const text = (this.field.value || '').trim();
    if (!text || this.sending) return;
    this.sending = true;
    // Cleared straight away rather than on the response: he has pressed enter,
    // the message is gone as far as he is concerned, and a field that empties
    // half a second later reads as a dropped keystroke.
    this.field.setValue('');
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
      // Pressing `send` with a ray put the keys wherever they were; typing
      // straight on is the next thing he does either way.
      //
      // `raise: false`, and it is not the same call as pressing the field. If
      // the system keyboard is up it STAYS up — nothing blurred it, and
      // `setValue('')` above already emptied the field under it — so he can
      // keep dictating. Raising here would instead mean that sending with
      // Enter on a bluetooth keyboard summons a keyboard he is not using.
      this.field.take({ raise: false });
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
