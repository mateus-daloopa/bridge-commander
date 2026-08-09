// keys.js — which composer in the room is taking keystrokes, and what a key
// does when it gets there.
//
// **Nothing in this room ever focuses a DOM node.** Focusing a text input
// inside an immersive session asks the Quest browser for the system keyboard,
// and that is a shell surface which has to composite over the immersive layer.
// It does not throw and nothing can catch it: the browser leaves the session
// and the room is gone. Text only, headset only, instant — every symptom the
// captain reported, both from opening a chat and from pressing the wall's
// search field.
//
// The DOM focus was never what made typing work anyway. A paired keyboard
// delivers `keydown` to the document regardless of what is focused, and
// `main.js` already listens at the window. So the room owns the notion itself,
// the way it owns every other bit of interaction state: a module variable
// holding a Composer, never a DOM node, and nothing here asks the document
// which of its elements is active.
//
// This file imports nothing. That is deliberate — the room's modules pull in
// three.js and uikit and so cannot be loaded from a test, and the rule that
// `b`/`c`/`x` are dead while he is typing is exactly the rule worth testing.
// The surface a composer DRAWS is `field.js`.

// Exactly one composer takes keys, or none.
let holder = null;

export function keysHeld() { return holder; }

// The window's keydown comes through here FIRST. `true` means a composer took
// the key and no shortcut may see it — held is held, so `b`/`c`/`x` are dead
// while he is typing and alive the moment nothing holds the keys.
export function routeKey(e) {
  const c = holder;
  if (!c) return false;
  // A browser shortcut is his, not ours, but it is still not a room shortcut.
  if (e.ctrlKey || e.metaKey || e.altKey) return true;
  if (e.key === 'Enter') { if (!e.shiftKey) { e.preventDefault(); c.submit(); } }
  else if (e.key === 'Backspace') { e.preventDefault(); c.setValue(c.value.slice(0, -1)); }
  else if (e.key === 'Escape') { e.preventDefault(); c.release(); }
  // One code point is a character he typed. 'ArrowLeft' and 'F5' are not.
  else if ([...e.key].length === 1) { e.preventDefault(); c.setValue(c.value + e.key); }
  return true;
}

// What it means to be typed into: a value, and whether the keys are here.
// `paint` is the hook the drawn field overrides — this class knows nothing
// about how a field looks, which is what lets it be tested without a GPU.
export class Composer {
  constructor({ onChange = null, onSubmit = null } = {}) {
    this.value = '';
    this.onChange = onChange;
    this.onSubmit = onSubmit;
  }

  // Take the keys. Whoever had them loses them — one keyboard, one composer,
  // so a room with three chats open never has two of them listening.
  take() {
    if (holder === this) return this;
    const was = holder;
    holder = this;
    if (was) was.paint();
    this.paint();
    return this;
  }

  // Give them back to the room. Safe on a composer that never had them, which
  // is what makes closing a panel a one-liner.
  release() {
    if (holder !== this) return this;
    holder = null;
    this.paint();
    return this;
  }

  holds() { return holder === this; }

  setValue(v) {
    const next = String(v == null ? '' : v);
    if (next === this.value) return this;
    this.value = next;
    this.paint();
    if (this.onChange) this.onChange(next);
    return this;
  }

  submit() { if (this.onSubmit) this.onSubmit(this.value); }

  paint() {}
}
