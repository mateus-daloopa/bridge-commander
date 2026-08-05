// list.js — the mat on the floor that opens the board.
//
// This file used to hold a flat list of every card as well: rows you could read
// but not press, on a panel of its own. The board panel replaced it outright —
// same cards, readable titles, a filter, and every row one press deep — and two
// surfaces answering "where is that card" is a room he has to learn twice.
//
// What survives is the mat, which was always the good half: a control you
// glance DOWN at, below the band everything readable is held to, in the lane
// between the middle shelves where nothing else lives. It is deliberately not a
// surface you read, which is the only reason it is allowed to sit down there —
// still inside the 60° a neck will comfortably go to.

import * as THREE from 'three';
import * as W from './world.js';
import { root, Text, COL, fontFor, inert } from './kit.js';
import { Target } from './hover.js';

// ---- the mat that summons the board ---------------------------------------

// On the floor, in the lane between the two middle shelves, where nothing else
// lives. A control you glance down at rather than something you read — which is
// why it is allowed to sit below the band everything readable is held to.
export class ListPlate {
  constructor(onToggle) {
    const p = W.plate();
    this.at = p;
    this.group = new THREE.Group();
    this.group.position.set(p.pos.x, 0.002, p.pos.z);
    this.group.rotation.x = -Math.PI / 2;

    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(p.widthM, p.depthM),
      new THREE.MeshBasicMaterial({ color: COL.slot, transparent: true, opacity: 0.5 }),
    );
    this.group.add(face);

    const spot = new THREE.Mesh(
      new THREE.RingGeometry(p.widthM * 0.44, p.widthM * 0.5, 28),
      new THREE.MeshBasicMaterial({ color: '#7fd8ff', transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    spot.position.z = 0.001;
    spot.visible = false;
    this.group.add(spot);

    this.ui = root({
      sizeX: p.widthM, sizeY: p.depthM,
      justifyContent: 'center', alignItems: 'center', backgroundOpacity: 0,
    });
    inert(this.ui);
    this.ui.position.z = 0.002;
    this.group.add(this.ui);
    this.ui.add(new Text({
      text: 'the board', color: COL.dim, fontWeight: 'semi-bold',
      fontSize: fontFor(W.TYPE.body, p.dist),
    }));

    this.target = new Target({
      mesh: face, spot, name: 'list-plate',
      base: new THREE.Color(COL.slot), onSelect: onToggle,
    });
  }

  tick(now) { this.target.tick(now); }
}
