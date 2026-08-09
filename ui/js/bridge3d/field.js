// field.js — a text field the room draws itself.
//
// uikit's `Input` cannot be used for one here, and the reason is the bug this
// file exists for: an Input owns a hidden DOM <input> and focuses it from its
// own pointerdown handler, so merely PRESSING one inside an immersive session
// is enough to summon the Quest system keyboard and take the browser out of the
// room. See `keys.js` for the whole of it.
//
// So a field is a Container with a Text in it. The value, and whether the keys
// are here, come from `Composer`; this adds the box, the caret and the ring
// around it — and all three paint from the same state the keys are routed by,
// so what he sees is what will receive the next letter.

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
