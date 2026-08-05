// grab.js — taking hold of a window and putting it somewhere.
//
// Squeeze, not trigger. The trigger presses things; the grip moves them. Two
// verbs on two fingers is the one distinction that keeps "I meant to scroll it"
// from becoming "I have thrown it across the room", and it is why only the
// title bar answers a squeeze at all.
//
// The three beats the skill asks for, so the person and the room agree before
// anything moves:
//
//   1 SELECTION  the ray lands on a bar and it lights. Already done by hover.js.
//   2 LOCK-ON    the grip closes and the target FREEZES, so hand drift cannot
//                reassign it mid-move.
//   3 MOVE       the window keeps its offset from the hand and is steered from
//                where it is. It is never flown at the face.
//
// Keeping the offset is the whole trick, and `Object3D.attach()` is exactly
// that: it reparents while preserving the world transform, so the window does
// not jump to the controller the instant you close your hand.
//
// **No free physics.** Let go and it stays where it is — it does not fall, it
// does not drift, and it never ends up behind you: a release outside the room's
// bounds springs back to where it was picked up, in 250 ms.

import * as THREE from 'three';
import * as W from './world.js';

// Where a window is allowed to be left. Generous compared with where the room
// PLACES things, because this is his arrangement and not ours — but still
// bounded, because a window dropped behind your head is a window you will spend
// thirty seconds hunting for.
const BOUND = { azDeg: 75, elLowDeg: -55, elHighDeg: 25, nearM: 0.55, farM: 2.6 };
const SPRING_MS = 250;

export class Grabs {
  constructor(scene) {
    this.scene = scene;
    this.holds = new Map();          // controller -> what it is holding
    this.springs = [];
  }

  // Called by main.js for each controller, on squeeze. `hovered` is whatever
  // that controller's ray is currently on — grab.js never raycasts itself, so
  // there is exactly one ray in the room and one set of hover states.
  start(controller, hovered) {
    if (this.holds.has(controller)) return;
    const panel = grabbableOf(hovered);
    if (!panel) return;
    const g = panel.group;
    const home = { pos: g.position.clone(), quat: g.quaternion.clone() };
    // Lock-on: attach preserves the world transform, so nothing moves on the
    // frame the grip closes. That stillness IS the acknowledgement.
    controller.attach(g);
    this.holds.set(controller, { panel, home });
    panel.grabbed = true;
    return panel;
  }

  end(controller) {
    const held = this.holds.get(controller);
    if (!held) return;
    this.holds.delete(controller);
    const { panel, home } = held;
    this.scene.attach(panel.group);
    panel.grabbed = false;

    if (inBounds(panel.group.position)) {
      // His arrangement now. The room never places this window again.
      panel.placed = true;
      return panel;
    }
    // Out of bounds: back where it came from, fast enough to read as a refusal
    // rather than as a move.
    this.springs.push({
      group: panel.group, to: home, t: 0,
      from: { pos: panel.group.position.clone(), quat: panel.group.quaternion.clone() },
    });
    return panel;
  }

  // Held windows need no per-frame work — the scene graph carries them. This is
  // only the spring-back.
  tick(dt) {
    for (let i = this.springs.length - 1; i >= 0; i--) {
      const s = this.springs[i];
      s.t = Math.min(1, s.t + (dt * 1000) / SPRING_MS);
      const k = 1 - (1 - s.t) * (1 - s.t);        // ease-out
      s.group.position.lerpVectors(s.from.pos, s.to.pos, k);
      s.group.quaternion.slerpQuaternions(s.from.quat, s.to.quat, k);
      if (s.t >= 1) this.springs.splice(i, 1);
    }
  }

  get holding() { return this.holds.size > 0; }
}

// Walk up from whatever the ray hit until something claims to be grabbable.
// The bar is the only thing that ever sets it, but a ray lands on the Text
// inside the bar as readily as on the bar itself.
function grabbableOf(object) {
  let o = object;
  while (o) {
    if (o.userData && o.userData.grabbable) return o.userData.grabbable;
    o = o.parent;
  }
  return null;
}

export function inBounds(pos) {
  const a = W.angleOf({ x: pos.x, y: pos.y, z: pos.z });
  return Math.abs(a.az) <= BOUND.azDeg
    && a.el >= BOUND.elLowDeg && a.el <= BOUND.elHighDeg
    && a.dist >= BOUND.nearM && a.dist <= BOUND.farM;
}

export { BOUND };
