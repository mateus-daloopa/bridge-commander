// agents.js — the lieutenants, as eight spheres that never move.
//
// Eight is small enough that a stable arc becomes a memorised landmark set for
// free, and that is the entire win here — so the positions are FIXED and are
// never sorted, reflowed or reordered for any reason. The roster fills the arc
// from the middle outward in a permanent order, which means a lieutenant joining
// never shifts one that is already there, and a half-crewed board is still
// centred rather than piled against one wall.
//
// The arc runs from 0° at the ends to +5° in the middle, above the shelves and
// never higher: looking up is the fastest route to a sore neck.
//
// Nothing here breathes. Idle motion, twitch-per-event and the working states
// are the last card in this line and they need this one still underneath.

import * as THREE from 'three';
import * as W from './world.js';
import { root, Container, Text, Image, COL, cm, fontFor, inert, safe } from './kit.js';
import { avatarTexture, hasAvatar } from './avatars3d.js';
import { Target } from './hover.js';

export class Agents {
  constructor() {
    this.group = new THREE.Group();
    this.onSelect = null;          // set by main.js: what a press on a sphere does
    this.slots = [];
    for (let i = 0; i < W.AGENT.slots; i++) this.slots.push(this._slot(i));
  }

  _slot(i) {
    const at = W.agentAt(i);
    const g = new THREE.Group();
    g.position.set(at.pos.x, at.pos.y, at.pos.z);
    g.lookAt(0, W.EYE, 0);
    this.group.add(g);

    // A physically-shaded ball, not a flat one. Under the sky's image-based
    // light this picks up the sun on one side, the sky on top and the deck
    // underneath — which is the whole difference between a sphere and a
    // coloured disc, and it is what made these read as placeholders before.
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(W.AGENT.diaM / 2, 32, 24),
      new THREE.MeshStandardMaterial({
        color: COL.faint, roughness: 0.28, metalness: 0.05, envMapIntensity: 1.1,
      }),
    );
    g.add(ball);

    // The drawn sphere is 5.16° and the thing that answers a ray is 6.06°, so
    // the collider is its own geometry rather than the ball itself. It draws
    // nothing at all — no colour, no depth — it only exists to be hit.
    const hitR = W.sphereForArc(W.BUILD.hit, at.dist);
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(hitR, 12, 8),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
    );
    g.add(hit);

    // The proximity ring, on the plane facing the eye, closing to a dot as the
    // pointer comes in.
    const spot = new THREE.Mesh(
      new THREE.RingGeometry(hitR * 0.92, hitR, 32),
      new THREE.MeshBasicMaterial({ color: '#7fd8ff', transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    spot.visible = false;
    g.add(spot);

    // Colour never travels alone: the name under the sphere is the second
    // channel, and it is what makes two lieutenants of similar hue two people.
    //
    // **It sits on a plate, and that is not decoration.** As bare type against
    // the sky it measured 1.3:1 to 2.2:1 on the rendered frame against a 4.5:1
    // floor — every single label, over sky and over parapet alike. Light type
    // has nothing to be light against once the room stopped being black, and
    // there is no colour that survives a background which changes as he turns
    // his head. So the label carries its own background with it, the same
    // grammar as every panel: dark plate, light type, a rim for the shape.
    // Darkening the sky would have been the other fix and it is the wrong one —
    // the sky is the thing that made this a place.
    const ui = root({
      sizeX: W.sizeForArc(W.AGENT.pitchDeg - W.BUILD.gap, at.dist),
      sizeY: W.sizeForArc(W.TYPE.body * 2.0, at.dist),
      justifyContent: 'center', alignItems: 'center', backgroundOpacity: 0,
    });
    inert(ui);
    ui.position.y = -(W.AGENT.diaM / 2 + W.sizeForArc(W.TYPE.body * 1.5, at.dist));
    g.add(ui);
    // The plate hugs the name rather than filling the berth: a nameplate as wide
    // as its slot is a row of bars, and the arc between two of them is the thing
    // that keeps eight spheres reading as eight people.
    const plate = new Container({
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      paddingX: cm(W.sizeForArc(0.9, at.dist)),
      paddingY: cm(W.sizeForArc(0.28, at.dist)),
      borderRadius: cm(0.010),
      backgroundColor: COL.panel, backgroundOpacity: 0.96,
      borderWidth: cm(0.0022), borderColor: COL.rim, borderOpacity: 0.75,
    });
    inert(plate);
    ui.add(plate);
    // The face, before the name. It answers "which one is Selma" from across
    // the terrace, where a five-letter word at 1.4° of em box does not — and it
    // is the second channel the colour is not allowed to travel without.
    // Square, the height of the type it sits beside, and hidden entirely when
    // the lieutenant has no avatar, because the documented absent value means
    // the colour dot and never a blank square.
    const face = new Image({
      width: cm(W.sizeForArc(W.TYPE.body * 1.45, at.dist)),
      height: cm(W.sizeForArc(W.TYPE.body * 1.45, at.dist)),
      marginRight: cm(W.sizeForArc(0.5, at.dist)),
      borderRadius: cm(0.006), flexShrink: 0, display: 'none',
      objectFit: 'fill',
    });
    inert(face);
    plate.add(face);
    const label = new Text({
      text: '', color: COL.text, fontWeight: 'semi-bold',
      fontSize: fontFor(W.TYPE.body, at.dist),
    });
    inert(label);
    plate.add(label);

    // Pointing at a lieutenant and pressing opens its chat. The sphere is the
    // shortest route to the thing he actually came here to do, so it is the one
    // target in the room that needed no other justification.
    const target = new Target({
      mesh: hit, mark: ball, spot, name: 'lieutenant', base: new THREE.Color(COL.faint),
      onSelect: () => { const s = this.slots[i]; if (s.lt && this.onSelect) this.onSelect(s.lt); },
    });
    // A collider that draws nothing has no colour to change, so the hover state
    // lives on the ball's rim instead — same six states, painted where they can
    // actually be seen.
    target._paint = () => {
      const s = target.state;
      const hot = s === 'contact' || s === 'held';
      const lit = s !== 'idle';
      target._want = s === 'idle' || s === 'released' ? 1 : (hot ? W.STEP * 1.03 : W.STEP);
      ball.material.emissive.set(hot ? '#2a5f7a' : (lit ? '#16303f' : '#000000'));
      spot.visible = lit;
    };

    return { i, at, group: g, ball, hit, spot, ui, plate, face, label, target, lt: null };
  }

  // Who sits where. `index` is the lieutenant's place in the board's own roster,
  // and the mapping from that to a slot is fixed for the life of the roster.
  paint(doc) {
    const lts = doc.lieutenants || [];
    for (const s of this.slots) { s.lt = null; }
    lts.forEach((lt, index) => {
      const slot = W.agentSlotFor(index);
      if (slot < 0) return;
      const s = this.slots[slot];
      s.lt = lt;
      s.ball.material.color.set(W.agentColour(lt.color));
      s.label.setProperties({ text: safe(lt.name || lt.id) });
      const tex = avatarTexture(lt.avatar);
      s.face.setProperties(tex ? { src: tex, display: 'flex' } : { display: 'none' });
    });
    for (const s of this.slots) {
      const on = !!s.lt;
      s.ball.visible = on;
      s.ui.visible = on;
      // An empty berth answers no ray — `pointerEvents`, not `visible`, because
      // that is the property the pointer library actually reads.
      s.hit.pointerEvents = on ? 'listener' : 'none';
      // An empty berth is still a place — it says the arc holds eight and four
      // of them are not crewed, which is information rather than a gap.
      // An empty berth shows no nameplate at all — a plate with no name on it
      // is a thing he would try to read.
      s.plate.setProperties({ display: on ? 'flex' : 'none' });
      if (!on) { s.label.setProperties({ text: '' }); s.spot.visible = false; }
    }
  }

  tick(now) { for (const s of this.slots) s.target.tick(now); }
}
