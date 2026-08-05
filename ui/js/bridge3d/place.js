// place.js — the terrace he is standing on.
//
// `world.md` asks for a **place**: a bounded region with landmarks under it,
// that a person builds an accurate mental map of. We had the landmarks and the
// bounds only as arithmetic — a ring painted on black — and it turns out a
// bound you cannot see is not a bound. This is the built version: a deck with a
// material, a parapet you can walk up to, planters that tell your eye how big
// everything else is, and a skyline far enough away to be scenery.
//
// **Why props at all.** They are not decoration, they are scale. A sphere 18 cm
// across at 2 m is unreadable as a size until there is something beside it whose
// size you already know — and once your eye has a planter and a hand rail, every
// other distance in the room snaps into place. Horizon Central does this with
// palms and furniture and nothing else; two or three well-placed things beat a
// dressed set.
//
// **The frame budget is spent deliberately.** Deleting the shelves handed back
// 190 draw calls; this spends a fraction of them and instances everything that
// repeats — the balusters are one call, the skyline is one call, the planters
// are one call each for pot and plant. No shadow maps: a baked contact gradient
// under each prop does the job a shadow map would, for one transparent quad.

import * as THREE from 'three';
import * as W from './world.js';

// The terrace. 4.90 m to the parapet, which puts its top edge at -4.7° and the
// deck edge at -16.5° from a 1.45 m eye — so it backs every panel he opens
// without ever rising into the band he reads in.
export const TERRACE = { deckR: 5.0, wallR: 4.90, wallH: 1.05, copingR: 0.075 };

// ---- surfaces --------------------------------------------------------------

// A stone deck: large slabs, a little grain, a little variation slab to slab.
// Drawn rather than fetched, like the sky — this repo has no build step and no
// business growing a texture folder for two surfaces.
function deckTexture(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#9a958c';
  ctx.fillRect(0, 0, size, size);

  // Grain first, under everything, so the joints sit on top of it.
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);

  // Four slabs across, each very slightly its own colour — a floor of
  // identical tiles reads as a texture, a floor of nearly-identical ones reads
  // as a floor.
  const n = 4, s = size / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const k = ((x * 7 + y * 13) % 5) - 2;
      ctx.fillStyle = `rgba(${150 + k * 6},${146 + k * 6},${138 + k * 6},0.35)`;
      ctx.fillRect(x * s + 1, y * s + 1, s - 2, s - 2);
    }
  }
  ctx.strokeStyle = 'rgba(70,66,60,0.5)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(size, i * s); ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(4, 4);
  return tex;
}

// The soft dark patch a thing sitting on the ground puts under itself. One
// texture, shared by every prop — this is the whole shadow budget and it looks
// better at this distance than a 512² shadow map would.
function contactTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(30,26,22,0.55)');
  g.addColorStop(0.55, 'rgba(30,26,22,0.22)');
  g.addColorStop(1, 'rgba(30,26,22,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- the build -------------------------------------------------------------

export function buildTerrace(scene) {
  const group = new THREE.Group();
  const contact = contactTexture();

  // The deck.
  const deck = new THREE.Mesh(
    new THREE.CircleGeometry(TERRACE.deckR, 64),
    new THREE.MeshStandardMaterial({ map: deckTexture(), roughness: 0.92, metalness: 0.0 }),
  );
  deck.rotation.x = -Math.PI / 2;
  group.add(deck);

  // Its edge, so the terrace has a thickness rather than being a decal on the
  // sky — you only ever see this from the parapet, and it is what stops the
  // place reading as a floating disc.
  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(TERRACE.deckR, TERRACE.deckR * 0.86, 1.1, 48, 1, true),
    new THREE.MeshStandardMaterial({ color: '#7d7970', roughness: 0.95, side: THREE.DoubleSide }),
  );
  skirt.position.y = -0.55;
  group.add(skirt);

  // The parapet: the visible bound. Pale, so it catches the sun and reads
  // against both the sky above it and the deck below.
  const wallMat = new THREE.MeshStandardMaterial({ color: '#d9d5cc', roughness: 0.75, metalness: 0.02, side: THREE.DoubleSide });
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(TERRACE.wallR, TERRACE.wallR, TERRACE.wallH, 64, 1, true),
    wallMat,
  );
  wall.position.y = TERRACE.wallH / 2;
  group.add(wall);

  // A handrail on top of it. A torus is one draw and it is the single detail
  // that makes the parapet read as something built rather than as a cylinder.
  const coping = new THREE.Mesh(
    new THREE.TorusGeometry(TERRACE.wallR, TERRACE.copingR, 10, 72),
    new THREE.MeshStandardMaterial({ color: '#e8e4da', roughness: 0.45, metalness: 0.12 }),
  );
  coping.rotation.x = -Math.PI / 2;
  coping.position.y = TERRACE.wallH;
  group.add(coping);

  // Uprights under the rail, instanced: 48 of them for one draw call.
  const posts = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.028, 0.028, TERRACE.wallH * 0.62, 6),
    new THREE.MeshStandardMaterial({ color: '#c8c4ba', roughness: 0.6, metalness: 0.15 }),
    48,
  );
  const m = new THREE.Matrix4();
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    m.makeTranslation(Math.cos(a) * TERRACE.wallR, TERRACE.wallH * 0.69, Math.sin(a) * TERRACE.wallR);
    posts.setMatrixAt(i, m);
  }
  posts.instanceMatrix.needsUpdate = true;
  group.add(posts);

  group.add(...planters(contact));
  group.add(skyline());
  group.add(seaLevel());

  scene.add(group);
  return group;
}

// Six planters around the parapet, out of his way and in his peripheral vision.
// They are the scale reference: a 62 cm pot beside a 18 cm sphere tells the eye
// what both of them are, which no amount of correct arc can do on its own.
function planters(contact) {
  const out = [];
  // Behind and to the sides — never in the forward arc, where they would sit
  // behind a panel he is reading.
  const at = [-150, -105, -60, 60, 105, 150].map((d) => d * Math.PI / 180);
  const r = TERRACE.wallR - 0.62;

  const pots = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.30, 0.24, 0.62, 16),
    new THREE.MeshStandardMaterial({ color: '#b8b0a2', roughness: 0.85 }),
    at.length,
  );
  // Foliage as a few overlapping spheres per pot, squashed — cheap, and at this
  // distance a leaf is a lie nobody can check.
  const perPlant = 4;
  const leaves = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshStandardMaterial({ color: '#4f7a3f', roughness: 0.9 }),
    at.length * perPlant,
  );
  const shadows = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: contact, transparent: true, depthWrite: false }),
  );
  const shadowGroup = new THREE.Group();

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  at.forEach((a, i) => {
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    m.makeTranslation(x, 0.31, z);
    pots.setMatrixAt(i, m);
    for (let k = 0; k < perPlant; k++) {
      const t = (k / perPlant) * Math.PI * 2 + i;
      p.set(x + Math.cos(t) * 0.16, 0.72 + (k % 2) * 0.20, z + Math.sin(t) * 0.16);
      s.set(1, 0.72 + (k % 2) * 0.3, 1);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t);
      m.compose(p, q, s);
      leaves.setMatrixAt(i * perPlant + k, m);
    }
    const sh = shadows.clone();
    sh.rotation.x = -Math.PI / 2;
    sh.position.set(x, 0.004, z);
    sh.scale.setScalar(1.15);
    shadowGroup.add(sh);
  });
  pots.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  out.push(pots, leaves, shadowGroup);
  return out;
}

// Far enough away to be scenery and never to be walked to. Its whole job is to
// give the sky a bottom edge and the crew something behind them that is not
// bare sky — a saturated sphere against a pale horizon reads as a silhouette,
// and against a pale building it reads as a sphere.
//
// **Every tower is placed by the elevation it should reach, not by a height in
// metres.** The first version picked heights out of the air and the skyline
// landed in exactly the band the crew occupies, competing with the eight things
// he is meant to be looking at. Here the top elevation is chosen first — a
// shallow band from just under the horizon to +7° — and the height falls out of
// the distance, which is the same discipline as everything else in this room.
// They rise from sea level so their bases are hidden behind the parapet.
const SKY_BOTTOM = -7.5;

function skyline() {
  const n = 18;
  const towers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.72, metalness: 0.04 }),
    n,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    // Deterministic, so the skyline is the same place every time he arrives.
    const a = (i / n) * Math.PI * 2 + 0.31;
    const forward = Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI) < 0.62;
    // Kept low across the forward arc, where the crew and the panels live, and
    // allowed to stand up behind him and out to the sides.
    const topDeg = forward ? -1.2 + ((i * 17) % 5) * 0.5 : 1.5 + ((i * 23) % 9) * 0.62;
    const d = 58 + ((i * 37) % 13) * 4.2;
    const h = (W.EYE - SKY_BOTTOM) + d * Math.tan(topDeg * Math.PI / 180);
    const w = 5 + ((i * 29) % 7) * 1.6;
    p.set(Math.sin(a) * d, SKY_BOTTOM + h / 2, -Math.cos(a) * d);
    sc.set(w, h, w * 0.8);
    q.setFromAxisAngle(up, a);
    m.compose(p, q, sc);
    towers.setMatrixAt(i, m);
    // Pale and hazy, further ones paler — aerial perspective, done by hand
    // because there is no fog cheap enough to be worth the state change.
    const haze = Math.min(1, (d - 55) / 55);
    c.setHSL(0.58, 0.15 - haze * 0.07, 0.70 + haze * 0.15);
    towers.setColorAt(i, c);
  }
  towers.instanceMatrix.needsUpdate = true;
  if (towers.instanceColor) towers.instanceColor.needsUpdate = true;
  return towers;
}

// The ground far below and away, so looking over the parapet is looking at
// something. One disc, no detail — it is 40 m away and its only job is to stop
// the horizon being a seam between two gradients.
function seaLevel() {
  const g = new THREE.Mesh(
    new THREE.CircleGeometry(160, 48),
    new THREE.MeshStandardMaterial({ color: '#7d8a86', roughness: 1.0 }),
  );
  g.rotation.x = -Math.PI / 2;
  g.position.y = -7.5;
  return g;
}

// The crew's own landmark, rebuilt for a lit room: an inlaid band in the deck
// rather than a glowing ring on black. It is part of the floor, which is the
// whole reason a landmark works — an abstraction with no physical anchor gets
// read as a map of something else.
export function crewInlay() {
  const inlay = new THREE.Mesh(
    new THREE.RingGeometry(W.AGENT.distM - 0.075, W.AGENT.distM + 0.005, 96, 1, Math.PI * 0.72, Math.PI * 1.56),
    new THREE.MeshStandardMaterial({ color: '#6f7c86', roughness: 0.35, metalness: 0.45 }),
  );
  inlay.rotation.x = -Math.PI / 2;
  inlay.position.y = 0.004;
  return inlay;
}
