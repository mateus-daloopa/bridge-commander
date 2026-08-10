// keys.js — which composer in the room is taking keystrokes, and what a key
// does when it gets there.
//
// **The Quest system keyboard works inside an immersive session, and the note
// that used to be here saying otherwise was wrong.** It is supported from Quest
// Browser 26.1, advertised per-session as `XRSession.isSystemKeyboardSupported`,
// and the session SURVIVES it: visibility goes to `visible-blurred` while it is
// up and back to `visible` when it is dismissed. Focusing a text field is how
// you raise it. That is worth having for one reason above every other — the
// system keyboard dictates, and nothing the room could draw itself does.
//
// What really took the browser out of the session is in `syskb.js`, and it was
// the ELEMENT rather than the focus: uikit parks its hidden input at
// `left: -1000vw`, and an off-screen field is the one pitfall Meta's own doc
// names — the page scrolls to it the moment typing starts. Different bug, same
// symptom, still a bug. So uikit's `Input` stays out of `kit.js`, and the field
// the room does focus is one transparent pixel inside the viewport.
//
// Two things can hand a character to a composer, and they must never both hand
// over the same one:
//
//   · a paired BLUETOOTH keyboard, whose `keydown` reaches the window whatever
//     is focused — `main.js` listens there and calls `routeKey`;
//   · the SYSTEM keyboard, which exposes no key events at all. Its only channel
//     is the DOM field's `value`, so `syskb.js` reads that and calls
//     `setValue`. While that field is focused, `routeKey` keeps its hands off
//     the characters and minds the shortcuts.
//
// This file imports nothing. That is deliberate — the room's modules pull in
// three.js and uikit and so cannot be loaded from a test, and the rules here
// (that `b`/`c`/`x` are dead while he is typing, and that a keystroke is never
// applied twice) are exactly the rules worth testing. The keyboard arrives
// through `setKeyboard` rather than an import for the same reason: a test hands
// in a fake and asserts what the room asked it to do.
//
// The surface a composer DRAWS is `field.js`. Nothing in this room is ever
// rendered by the browser — the DOM field is a source of characters and has no
// appearance at all.

// Exactly one composer takes keys, or none.
let holder = null;

// The system keyboard, when the room has one. Null on a desk, null on a browser
// that does not advertise it, and then everything below behaves exactly as it
// did before any of this: bluetooth, or nothing.
let keyboard = null;

export function keysHeld() { return holder; }
export function setKeyboard(kb) { keyboard = kb || null; return keyboard; }

// The window's keydown comes through here FIRST. `true` means a composer took
// the key and no shortcut may see it — held is held, so `b`/`c`/`x` are dead
// while he is typing and alive the moment nothing holds the keys.
export function routeKey(e) {
  const c = holder;
  if (!c) return false;
  // A browser shortcut is his, not ours, but it is still not a room shortcut.
  if (e.ctrlKey || e.metaKey || e.altKey) return true;
  if (e.key === 'Enter') { if (!e.shiftKey) { e.preventDefault(); c.submit(); } return true; }
  if (e.key === 'Escape') { e.preventDefault(); c.release(); return true; }
  // With the system keyboard's field focused, that field IS the text: its
  // `input` event has already carried this keystroke into the composer, so
  // applying it here as well would type every letter twice and delete two
  // characters per backspace. Enter and Escape above are safe either way —
  // neither changes the field's value, so neither arrives twice.
  if (keyboard && keyboard.driving()) return true;
  if (e.key === 'Backspace') { e.preventDefault(); c.setValue(c.value.slice(0, -1)); }
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
  //
  // `raise` is whether this also asks for the system keyboard. Pressing a field
  // does; a panel OPENING does not, and that distinction is the whole of it —
  // opening a chat is an intention to talk, not an instruction to fill the room
  // with a keyboard he did not ask for. He gets the caret, the ring and his
  // bluetooth keyboard immediately, and the system keyboard when he presses.
  take({ raise = true } = {}) {
    if (holder !== this) {
      const was = holder;
      holder = this;
      // The system keyboard belongs to whoever holds the keys. When they move
      // without asking for it, the old holder is dismissed rather than left
      // being typed into by a field it no longer owns — and blurring makes
      // `driving()` false, so bluetooth resumes into the new holder at once.
      if (was && !raise && keyboard) keyboard.dismiss(was);
      if (was) was.paint();
      this.paint();
    }
    // Deliberately outside that branch: pressing a field that ALREADY holds the
    // keys re-raises the keyboard, and after a dismissal that is the only way
    // back to it.
    if (raise && keyboard) keyboard.raise(this);
    return this;
  }

  // Give them back to the room. Safe on a composer that never had them, which
  // is what makes closing a panel a one-liner.
  release() {
    if (holder !== this) return this;
    holder = null;
    if (keyboard) keyboard.dismiss(this);
    this.paint();
    return this;
  }

  holds() { return holder === this; }

  setValue(v) {
    const next = String(v == null ? '' : v);
    if (next === this.value) return this;
    this.value = next;
    this.paint();
    // The keyboard's field has to be told when the ROOM changed the text under
    // it — `send()` clearing the composer is the case that bites, because the
    // field would otherwise still hold the sent message and hand it back with
    // the next letter attached. `sync` is a no-op for a value that came FROM
    // the field, which is what keeps this from looping.
    if (keyboard) keyboard.sync(this);
    if (this.onChange) this.onChange(next);
    return this;
  }

  submit() { if (this.onSubmit) this.onSubmit(this.value); }

  paint() {}
}
