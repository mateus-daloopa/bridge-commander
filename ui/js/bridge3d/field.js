// field.js — a text field the room draws itself.
//
// A field is a Container with a Text in it. The value, and whether the keys are
// here, come from `Composer`; this adds the box, the caret and the ring around
// it — and all three paint from the same state the keys are routed by, so what
// he sees is what will receive the next letter.
//
// It is drawn here rather than by uikit's `Input` for two reasons, and the
// first one used to be stated wrongly: focusing a DOM input inside a session is
// FINE and the room does it on purpose to raise the system keyboard (syskb.js).
// What is not fine is where uikit puts its element — `left: -1000vw`, the
// off-screen field Meta's doc says the page will scroll to. The other reason
// needs no correction: nothing in this room is rendered by the browser, and an
// `Input` brings its own glyphs, its own caret and its own selection.
//
// So the DOM field is a source of characters with no appearance, and this is
// the appearance. `paint()` is called for a keystroke from either of them.

import { Container, Text, COL, cm, inert, safe } from './kit.js';
import { Composer } from './keys.js';

export class Field extends Composer {
  // `box` is the field's own geometry — the caller knows how wide its foot or
  // its rail tile is and this file does not. `chars` is how much of the value
  // fits across it; the TAIL is what is shown, because the tail is where the
  // caret is and a field that hides what he just typed reads as dropped keys.
  constructor({ box, fontSize, placeholder = '', chars = 40, onChange = null, onSubmit = null }) {
    super({ onChange, onSubmit });
    this.placeholder = placeholder;
    this.chars = chars;

    this.box = new Container({
      flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
      backgroundColor: COL.field, backgroundOpacity: 1,
      borderWidth: cm(0.0018), borderColor: COL.faint, borderOpacity: 0.6,
      hover: { borderColor: COL.accent, borderOpacity: 1 },
      ...box,
    });
    this.text = new Text({
      text: safe(placeholder), fontSize, color: COL.faint, wordBreak: 'keep-all', flexShrink: 0,
    });
    inert(this.text);
    this.box.add(this.text);
  }

  paint() {
    const mine = this.holds();
    const shown = safe(this.value).slice(-this.chars);
    this.text.setProperties({
      text: (shown || (mine ? '' : safe(this.placeholder))) + (mine ? '|' : ''),
      color: shown ? COL.text : COL.faint,
    });
    this.box.setProperties({
      borderColor: mine ? COL.accent : COL.faint,
      borderOpacity: mine ? 1 : 0.6,
    });
  }
}
