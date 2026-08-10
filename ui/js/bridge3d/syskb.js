// syskb.js — the Quest system keyboard, raised from inside the session.
//
// **The room's old note said focusing a DOM input kills the session. It is
// wrong, and the correction matters more than the bug did**: the system
// keyboard is supported inside an immersive session from Quest Browser 26.1,
// advertised per-session as `XRSession.isSystemKeyboardSupported`, and the
// session survives it — visibility goes to `visible-blurred` while it is up and
// back to `visible` when it is dismissed. Meta documents the whole thing:
// https://developers.meta.com/horizon/documentation/web/webxr-keyboard/
//
// That is worth having for one reason above all the others: **the system
// keyboard dictates.** Nothing we could draw ourselves does.
//
// ---- what the old crash actually was ---------------------------------------
//
// Not `focus()`. The element. uikit's hidden input is parked at
// `left: -1000vw` (`ui/vendor/uikit/text/input/hidden-input.js`), and that is
// the one pitfall the doc calls out by name: "when appended to an off-screen
// location, like outside the underlying viewport, the web page scrolls to the
// text field when the user types." A flat page yanked a thousand viewport
// widths sideways under a live immersive layer is a different bug with the same
// symptom, and it is still a bug. So this element sits IN the viewport — one
// transparent pixel in the corner — and uikit's `Input` stays banned, now for a
// reason we can point at rather than a theory.
//
// ---- and how it behaves ------------------------------------------------------
//
// **There is no keystroke stream.** The doc is explicit: no key-press events
// are exposed, the field's `value` is the only channel, and every time the
// keyboard is shown it starts a new editing session in which the first key
// press overwrites whatever the field held. So nothing here counts keys. The
// composer's text at the moment the keyboard went up is remembered, the field's
// `input` event carries the rest, and `seamOf()` at the foot of this file
// decides — once per showing — whether what arrived replaced the seed or was
// typed after it.

// One transparent pixel, fixed to the corner of the viewport. Fixed rather than
// absolute so it cannot extend the page and give the browser somewhere to
// scroll to; `opacity: 0` rather than `display:none` or `visibility:hidden`
// because both of those make an element unfocusable and focus is the whole
// mechanism. It is never pointed at — the ray presses the uikit field, and that
// is what calls in here.
const STYLE = 'position:fixed;left:0;top:0;width:1px;height:1px;padding:0;border:0;'
  + 'margin:0;opacity:0;background:transparent;color:transparent;pointer-events:none;';

// The one switch that turns all of this off. See `supported()`. The room takes
// the default; `?syskb=1` turns it back on for one deliberate attempt, and the
// test passes `{ enabled: true }` so the mechanism below stays exercised while
// it is switched off in the headset.
const ENABLED = false;

// ---- crumbs -----------------------------------------------------------------
//
// A man in a headset has no console, no devtools and no cable, and whatever took
// the room down took the room's own surfaces with it. So the trail is written to
// `localStorage` a step at a time and read back on the NEXT load, where main.js
// prints it on the gate. That is the whole design: the log has to outlive the
// thing it is logging, and only storage does.
const CRUMBS = 'syskb-crumbs';
const store = () => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

export function crumbs() {
  const s = store();
  try { return s ? JSON.parse(s.getItem(CRUMBS) || '[]') : []; } catch { return []; }
}

export function crumb(line) {
  const s = store();
  if (!s) return;
  // Stamped off the same clock the loop's pulse uses, so the two can be read
  // against each other: a pulse that stops at the last crumb is a frozen room, a
  // pulse that runs past it is a room that kept turning.
  const at = typeof performance === 'undefined' ? 0 : Math.round(performance.now());
  // Written synchronously and one line at a time, because the interesting run is
  // the one that never gets to write a second line — where it stops IS the
  // finding.
  try { s.setItem(CRUMBS, JSON.stringify([...crumbs(), at + 'ms ' + line].slice(-60))); } catch { /* full or blocked */ }
}

// The render loop's pulse, in a slot of its own so a heartbeat a second does not
// push the interesting lines out of the trail. It answers the one question the
// crumbs cannot: whether the room went on turning after the keyboard came up. A
// pulse that stops where the trail stops is a frozen room; a pulse that outlives
// it is a room that is fine and a session that ended.
const BEAT = 'syskb-beat';
export function beat(line) { const s = store(); try { if (s) s.setItem(BEAT, line); } catch { /* blocked */ } }
export function lastBeat() { const s = store(); try { return s && s.getItem(BEAT); } catch { return null; } }

export function clearCrumbs() {
  const s = store();
  try { if (s) { s.removeItem(CRUMBS); s.removeItem(BEAT); } } catch { /* blocked */ }
}

export class SystemKeyboard {
  constructor(doc = typeof document === 'undefined' ? null : document, { enabled = ENABLED } = {}) {
    this.doc = doc;
    this.enabled = enabled;
    this.session = null;
    this.el = null;
    this.composer = null;
    this.base = '';          // the composer's text when the keyboard went up
    this.seam = null;        // what to keep of it — decided on the first input
    this.applying = false;   // inside our own setValue, so `sync` stays out
    this.scroll = [0, 0];
  }

  // Called when a session starts. The element is created here and removed on
  // `detach`, which is what the doc asks for: an input left in the page after
  // the session ends is a focus trap on the flat board.
  attach(session) {
    this.detach();
    this.session = session || null;
    // Recorded whether or not the keyboard is switched on, because it costs
    // nothing and it settles the first question on its own: entering the room
    // once, with the keyboard off and nothing at risk, says whether his browser
    // advertises support at all.
    if (this.session) {
      crumb('attach: isSystemKeyboardSupported=' + JSON.stringify(this.session.isSystemKeyboardSupported)
        + ' (' + typeof this.session.isSystemKeyboardSupported + ')'
        + ' enabled=' + this.enabled
        + ' visibility=' + this.session.visibilityState
        + ' ua=' + ((typeof navigator === 'undefined' ? '' : navigator.userAgent) || '?'));
    }
    if (!this.supported()) return this;
    const el = this.doc.createElement('input');
    el.type = 'text';
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('tabindex', '-1');
    // A system keyboard that helpfully capitalises and corrects is a system
    // keyboard rewriting his Portuguese on the way in.
    el.autocomplete = 'off';
    el.autocapitalize = 'off';
    el.spellcheck = false;
    el.setAttribute('autocorrect', 'off');
    el.style.cssText = STYLE;
    el.addEventListener('input', () => this._input());
    // Dismissing the keyboard — Done, the Meta button, a press outside it —
    // blurs the field. The composer KEEPS the keys: a paired bluetooth keyboard
    // still types into it, and pressing the field is how he asks for the system
    // keyboard back. Releasing here would make `b`/`c`/`x` live again while he
    // is plainly still in the middle of a sentence.
    el.addEventListener('blur', () => { crumb('blur'); this.composer = null; });
    this.doc.body.appendChild(el);
    this.el = el;
    return this;
  }

  detach() {
    if (this.el) { this.el.remove(); this.el = null; }
    this.session = null;
    this.composer = null;
    return this;
  }

  // False on a desk, on an older browser, and on any session that does not
  // advertise it — and then every path here is a no-op and the room behaves
  // exactly as it did: the bluetooth keyboard, and nothing else.
  //
  // DISABLED (MNC-87). It is false on a real headset too, right now, because
  // raising the keyboard there takes the room down and a room he cannot use is
  // worse than a room without dictation. With this off `attach` never builds the
  // field, so `raise`, `driving`, `dismiss` and `sync` are all no-ops and every
  // composer behaves as it did before syskb.js landed. Flip ENABLED back on
  // once the crash is understood — everything below is still here and still
  // tested.
  supported() {
    return this.enabled && !!(this.doc && this.session && this.session.isSystemKeyboardSupported);
  }

  // Is the DOM field the thing carrying his typing right now? While it is, the
  // window's `keydown` must not ALSO apply the character — the field's `input`
  // event has already carried it, and applying both types everything twice.
  driving() {
    return !!(this.el && this.doc.activeElement === this.el);
  }

  // Press a composer -> the keyboard comes up. Pressing one that already holds
  // the keys re-raises it, because dismissing with Done is not letting go and
  // pressing the field is the only way back.
  raise(composer) {
    if (!this.supported() || !composer) return false;
    this.composer = composer;
    this.base = composer.value || '';
    this.seam = null;
    // Seeded, so the keyboard opens onto what he has already written rather
    // than onto a blank. Whether the seed survives his first key press is the
    // browser's business and `seamOf` finds out rather than assuming.
    this.el.value = this.base;
    this.scroll = [this.win().scrollX || 0, this.win().scrollY || 0];
    // Three crumbs around one line, on purpose. If the trail ends at "focusing"
    // the call itself is what kills it; if it ends at "focused" the damage
    // arrives afterwards, when the keyboard comes up.
    crumb('raise: seed=' + JSON.stringify(this.base) + ' focusing');
    this.el.focus();
    crumb('raise: focused, driving=' + this.driving()
      + ' visibility=' + (this.session && this.session.visibilityState));
    this._unscroll();
    return true;
  }

  // Dismissal is watched at the FIELD and not at the session. The doc lists two
  // signals for it — the field blurs, and `visibilityState` goes back from
  // `visible-blurred` to `visible` — and they say the same thing. Blur is the
  // one that also fires when the room moves the keys to another composer, so
  // one listener covers both and there is no second notion of "up" to keep in
  // step with the first.
  dismiss(composer) {
    if (composer && this.composer && composer !== this.composer) return false;
    this.composer = null;
    if (this.el && this.driving()) this.el.blur();
    return true;
  }

  // The room changed the text under the keyboard — `send()` clearing the
  // composer is the case that matters. Without this the field still holds the
  // sent message and the next letter arrives with it attached.
  //
  // `applying` is what keeps it from eating its own tail: every character the
  // field delivers arrives as a `setValue`, and treating that as the ROOM
  // changing the text would re-seed the seam on every keystroke and paste the
  // sentence in front of itself one letter at a time — "olá" typed as "ollá".
  sync(composer) {
    if (this.applying) return false;
    if (!this.el || composer !== this.composer) return false;
    this.base = composer.value || '';
    this.seam = null;
    this.el.value = this.base;
    return true;
  }

  _input() {
    const c = this.composer;
    crumb('input: ' + JSON.stringify(this.el.value) + (c ? '' : ' (nobody holds the keys)'));
    if (!c) return;
    const v = this.el.value;
    if (this.seam === null) {
      const seam = seamOf(this.base, v);
      // An empty first value says nothing about whether the seed survived, so
      // the decision waits for the next one and the composer keeps its text.
      if (seam === null) { this._unscroll(); return; }
      this.seam = seam;
    }
    this.applying = true;
    try { c.setValue(this.seam + v); } finally { this.applying = false; }
    this._unscroll();
  }

  win() { return (this.doc && this.doc.defaultView) || { scrollX: 0, scrollY: 0, scrollTo() {} }; }

  // Belt and braces against the documented pitfall. The element is in the
  // viewport so there should be nothing to scroll to; if the browser finds
  // something anyway, the flat page is put back where it was — the captain
  // leaves the session onto that page and it has to look like he left it.
  _unscroll() {
    const w = this.win();
    if ((w.scrollX || 0) === this.scroll[0] && (w.scrollY || 0) === this.scroll[1]) return;
    if (w.scrollTo) w.scrollTo(this.scroll[0], this.scroll[1]);
  }
}

// What survives of the composer's earlier text once the system keyboard has had
// its first say. Exported for the test. It is the other half of the question
// `routeKey` in keys.js answers — both are about who owns a character.
//
// The seed survives an EDIT in either direction: he can type after it, and he
// can backspace into it — the second is the whole reason the field is seeded at
// all, so reading it as an overwrite would defeat the point. `null` means the
// value decides nothing and the next one is asked instead.
//
// One ambiguity has no answer from the value alone: if the field really did
// overwrite and his first character happens to begin the seed — base "olá", he
// types "o" — the backspace rule reads it as a surviving seed and the earlier
// text stays. It costs one character, and no API we have distinguishes the two.
export function seamOf(base, first) {
  if (!base) return '';
  const v = String(first);
  if (v === '') return null;
  if (v.startsWith(base)) return '';
  if (base.startsWith(v)) return '';
  return base;
}
