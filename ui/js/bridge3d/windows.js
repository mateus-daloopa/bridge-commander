// windows.js — how many panels are open, where they land, and whose they are.
//
// One rule governs the whole file, and it is the one the captain will notice
// within a minute of putting the headset on:
//
//   **placement only ever touches a window he has not placed himself.**
//
// Once he has picked something up and put it down, that is where it lives, for
// as long as it is open. A room that tidies itself behind your back is a room
// you cannot arrange, and every automatic layout ever written eventually moves
// the thing you were reading.
//
// The slots are in `world.js`: two readable ones at ∓17.5° and two peripheral
// parking spaces at ∓36°. A panel opens into the first free slot; if they are
// all taken it opens on top of the least recently touched one, because refusing
// to open is worse than overlapping something he can move.

import * as W from './world.js';

export class Windows {
  constructor(scene) {
    this.scene = scene;
    this.open = [];                 // most recently touched last
  }

  // `key` identifies the thing the panel is ABOUT — a lieutenant id, a card id.
  // Asking for a panel that is already open raises it rather than making a
  // second one: two windows onto one conversation is a bug he would have to
  // tidy up himself.
  show(key, make) {
    let p = this.open.find((x) => x.key === key);
    if (!p) {
      p = make();
      p.key = key;
      this.scene.add(p.group);
      this.open.push(p);
      this.placeFree(p);
    }
    p.setOpen(true);
    this.touch(p);
    return p;
  }

  // A panel he has placed himself is never moved again — that is the rule this
  // file exists for. Everything else takes the first free slot; when both are
  // taken it lands on the least recently touched one, because a room that
  // refuses to open a window is worse than one that overlaps a window he can
  // pick up.
  placeFree(panel) {
    if (panel.placed) return panel;
    const taken = new Set(this.open.filter((p) => p !== panel && p.open && !p.placed).map((p) => p.slot));
    const free = W.PANEL_SLOTS.find((s) => !taken.has(s));
    if (free !== undefined) { panel.place(free); return panel; }
    const oldest = this.open.find((p) => p !== panel && p.open && !p.placed);
    panel.place(oldest ? oldest.slot : W.PANEL_SLOTS[0]);
    return panel;
  }

  touch(panel) {
    const i = this.open.indexOf(panel);
    if (i >= 0) this.open.splice(i, 1);
    this.open.push(panel);
  }

  close(panel) {
    panel.setOpen(false);
    const i = this.open.indexOf(panel);
    if (i >= 0) this.open.splice(i, 1);
    this.scene.remove(panel.group);
  }

  // The one in front — what a keystroke means when several are open.
  get front() {
    for (let i = this.open.length - 1; i >= 0; i--) if (this.open[i].open) return this.open[i];
    return null;
  }

  closeFront() {
    const p = this.front;
    if (p) this.close(p);
    return p;
  }

  tick(now) { for (const p of this.open) p.tick(now); }

  *[Symbol.iterator]() { yield* this.open; }
}
