// panel.js — a surface with prose on it that he can read, move, and put down.
//
// This is the piece the room was missing. Everything before it could be POINTED
// at and nothing could be READ, which is the difference between a museum and a
// place you work. A panel is deliberately flat and deliberately near: text stays
// flat, and comfort peaks between 1.0 and 2.0 m.
//
// Every size on it is authored in DEGREES at the distance it stands — see
// `world.js` for the figures and the `vr-design` skill for why they are those
// figures. At 1.10 m and 34° x 28° the body type is 1.4° of em box, which is
// 49 characters across and 14 lines down. That number is the whole design: it
// is what makes a card body readable rather than a scrolling chore.
//
// Three parts, and the split is functional rather than decorative:
//
//   · the BAR is the handle. It is the only part that answers a squeeze, so
//     grabbing a window can never be confused with pressing something on it.
//   · the BODY is prose. It scrolls, and nothing in it is a target.
//   · the FOOT is optional, and it is where a composer goes.
//
// A panel that has been placed by hand is never moved again by the room. A room
// that tidies itself behind your back is a room you cannot arrange.

import * as THREE from 'three';
import * as W from './world.js';
import { root, Container, Text, COL, cm, fontFor, inert, safe } from './kit.js';
import { Target } from './hover.js';

const SIZE = W.panelSize();

// The bar is a target, so it is the hit floor tall at the distance the panel
// stands — 6.06°, which at 1.10 m is 116 mm. That is generous for a title bar
// and it is not negotiable: it is the thing he has to hit to move the window.
const BAR_DEG = W.BUILD.hit;

export class Panel {
  constructor({ name = 'panel', title = '', subtitle = '', tint = COL.accent, onClose = null }) {
    this.name = name;
    this.placed = false;          // has he moved it himself? then the room never will
    this.slot = null;
    this.tint = tint;
    this.open = false;
    this._kids = [];

    this.group = new THREE.Group();
    this.group.visible = false;

    const pad = W.sizeForArc(1.0, W.PANEL.distM);
    const barM = W.sizeForArc(BAR_DEG, W.PANEL.distM);

    this.ui = root({
      sizeX: SIZE.widthM, sizeY: SIZE.heightM,
      flexDirection: 'column',
      backgroundColor: COL.panel, backgroundOpacity: 0.98,
      borderRadius: cm(0.018),
      borderWidth: cm(0.0022), borderColor: COL.rim, borderOpacity: 0.5,
    });
    this.group.add(this.ui);

    // ---- the bar: who this is, and the handle -------------------------------
    this.bar = new Container({
      flexDirection: 'row', alignItems: 'center', flexShrink: 0,
      height: cm(barM), paddingX: cm(pad), gap: cm(pad * 0.8),
      backgroundColor: COL.bar, backgroundOpacity: 1,
      borderTopLeftRadius: cm(0.018), borderTopRightRadius: cm(0.018),
    });
    this.ui.add(this.bar);

    // The owner's colour, always beside a name — colour never travels alone.
    this.chip = new Container({
      width: cm(W.sizeForArc(1.6, W.PANEL.distM)), height: '58%',
      borderRadius: cm(0.004), backgroundColor: tint, flexShrink: 0,
    });
    inert(this.chip);

    const stack = new Container({ flexDirection: 'column', flexGrow: 1, flexShrink: 1, overflow: 'hidden' });
    this.title = new Text({
      text: safe(title), fontSize: fontFor(W.TYPE.head, W.PANEL.distM),
      color: COL.text, fontWeight: 'semi-bold', wordBreak: 'keep-all',
    });
    this.subtitle = new Text({
      text: safe(subtitle), fontSize: fontFor(W.TYPE.meta, W.PANEL.distM),
      color: COL.dim, wordBreak: 'keep-all',
    });
    inert(this.title); inert(this.subtitle); inert(stack);
    stack.add(this.title, this.subtitle);

    // Close is a target in its own right and gets the whole hit floor square.
    this.closeBox = new Container({
      width: cm(barM * 0.78), height: cm(barM * 0.78), flexShrink: 0,
      borderRadius: cm(0.008), backgroundColor: COL.slot, backgroundOpacity: 1,
      justifyContent: 'center', alignItems: 'center',
      hover: { backgroundColor: '#2a5f7a' }, active: { backgroundColor: COL.accent },
    });
    const x = new Text({ text: 'x', fontSize: fontFor(W.TYPE.body, W.PANEL.distM), color: COL.text });
    inert(x);
    this.closeBox.add(x);

    this.bar.add(this.chip, stack, this.closeBox);

    // ---- the body: prose, scrolling, nothing in it is a target -------------
    this.body = new Container({
      flexGrow: 1, flexDirection: 'column', overflow: 'scroll',
      paddingX: cm(pad), paddingY: cm(pad * 0.7), gap: cm(pad * 0.5),
      scrollbarWidth: cm(W.sizeForArc(0.4, W.PANEL.distM)),
      scrollbarColor: COL.faint, scrollbarOpacity: 0.45,
      scrollbarBorderRadius: cm(0.004),
    });
    this.ui.add(this.body);

    // ---- the foot: a composer, when the panel has one ----------------------
    this.foot = new Container({
      flexDirection: 'row', alignItems: 'center', flexShrink: 0,
      paddingX: cm(pad), paddingBottom: cm(pad * 0.8), gap: cm(pad * 0.6),
      display: 'none',
    });
    this.ui.add(this.foot);

    // ---- what answers a ray ------------------------------------------------
    //
    // The bar is the grab handle and NOT a press: `grabbable` is what grab.js
    // looks for. Its own Target exists only so the six hover states paint on
    // it, because an object with no hover state is an object 36% of people do
    // not know they can touch.
    this.barTarget = new Target({ mesh: this.bar, name: name + '-bar' });
    this.barTarget._paint = () => {
      const s = this.barTarget.state;
      this.bar.setProperties({ backgroundColor: s === 'idle' ? COL.bar : COL.barLit });
    };
    this.bar.userData.grabbable = this;

    this.closeTarget = new Target({
      mesh: this.closeBox, name: name + '-close',
      onSelect: () => { this.setOpen(false); if (onClose) onClose(this); },
    });
    this.closeTarget._paint = () => {};      // uikit paints its own hover/active

    this.targets = [this.barTarget, this.closeTarget];
  }

  // Put the panel in a slot: turned to face the eye, then tilted back about its
  // OWN horizontal axis. Order matters — tilting in the room's frame instead
  // would make the two outer slots lean sideways.
  place(azDeg) {
    const at = W.panelAt(azDeg);
    this.slot = azDeg;
    this.group.position.set(at.pos.x, at.pos.y, at.pos.z);
    this.group.lookAt(0, W.EYE, 0);
    this.group.rotateX(-W.PANEL.tiltDeg * Math.PI / 180);
    return this;
  }

  setOpen(on) {
    this.open = on;
    this.group.visible = on;
    // `display`, not three's `visible`: uikit decides whether a component
    // answers a ray from its OWN visibility, and a subtree hidden by an
    // ancestor Group is still standing there waiting to be pointed at.
    this.ui.setProperties({ display: on ? 'flex' : 'none' });
  }

  setTitle(title, subtitle) {
    this.title.setProperties({ text: safe(title || '') });
    this.subtitle.setProperties({ text: safe(subtitle || '') });
  }

  setTint(hex) {
    this.tint = hex;
    this.chip.setProperties({ backgroundColor: hex });
  }

  // A paragraph of prose. Returns the Text so a caller can rewrite it in place
  // rather than rebuilding the panel, which is what the 5 s refresh does.
  addText(text, { size = W.TYPE.body, color = COL.text, weight = undefined } = {}) {
    const t = new Text({
      text: safe(text), fontSize: fontFor(size, W.PANEL.distM), color,
      // Without this every paragraph in a scrolling column is shrunk to fit the
      // container and they all land on top of each other — a wall of overtyped
      // glyphs that looks like a font bug and is a flex bug. A scroll container
      // holds children at their natural height; that is what scrolling is for.
      flexShrink: 0,
      ...(weight ? { fontWeight: weight } : null),
    });
    inert(t);
    this.body.add(t);
    this._kids.push(t);
    return t;
  }

  addRow(properties, children) {
    const row = new Container(properties);
    inert(row);
    for (const c of children) row.add(c);
    this.body.add(row);
    this._kids.push(row);
    return row;
  }

  // A uikit component is a three.js Mesh, so its `children` carries the
  // library's own internals as well as ours — hence our own list rather than
  // walking the scene graph and hoping.
  clearBody() {
    for (const c of this._kids) this.body.remove(c);
    this._kids.length = 0;
  }

  tick(now) { for (const t of this.targets) t.tick(now); }
}
