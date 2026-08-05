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
import { GLTFLoader } from '../../vendor/three/loaders/GLTFLoader.js';

// The terrace. 4.90 m to the parapet, which puts its top edge at -4.7° and the
// deck edge at -16.5° from a 1.45 m eye — so it backs every panel he opens
// without ever rising into the band he reads in.
export const TERRACE = { deckR: 5.0, wallR: 4.90, wallH: 1.05, copingR: 0.075 };

// ---- surfaces --------------------------------------------------------------

// Real photographed materials, CC0, from ambientCG — see ui/env/README.md.
//
// Colour, normal and a packed ORM in the glTF convention (R = ambient
// occlusion, G = roughness, B = metalness). Packed rather than three separate
// greyscale files because three reads the channel it wants out of each slot, so
// one image feeds aoMap, roughnessMap and metalnessMap for one texture fetch.
//
// **The normal map is the reason this is worth downloading at all.** It does
// more for how a surface reads than any amount of extra geometry — the deck is
// still one flat circle and it now has stones in it that catch the sun.
const TEX = new THREE.TextureLoader();

// Set once, from the renderer, before anything is built. A ground plane seen at
// a grazing angle is the worst case anisotropic filtering exists for, and this
// room is mostly a ground plane seen at a grazing angle: at 8 the deck breaks
// into metre-wide radial bands the moment he looks level, which reads as a
// texture bug and is a sampling one.
let MAX_ANISO = 8;
export function setAnisotropy(renderer) {
  MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
  return MAX_ANISO;
}

function pbr(name, { repeat = 1, repeatY = null, colorSpace = true } = {}) {
  const load = (suffix, srgb) => {
    const t = TEX.load(`/ui/env/${name}-${suffix}.webp`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeatY == null ? repeat : repeatY);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = MAX_ANISO;
    return t;
  };
  // Only the colour map is sRGB. A normal or a roughness read through the sRGB
  // curve is a normal or a roughness that is quietly wrong, and it looks like
  // "the lighting is a bit off" rather than like a bug.
  const orm = load('orm', false);
  return {
    map: load('color', colorSpace),
    normalMap: load('normal', false),
    aoMap: orm,
    roughnessMap: orm,
    metalnessMap: orm,
  };
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
  // 5 repeats across a 10 m circle puts a concrete panel joint every 2 m, which
  // is what a poured terrace looks like. A texture whose scale disagrees with
  // the props standing on it is the fastest way to make a room feel like a model.
  //
  // It is smooth concrete rather than the cobbles this started with, and the
  // reason is measured: a texture with strong LARGE-SCALE colour variation —
  // mossy joints — bands into metre-wide stripes when the deck is seen at a
  // grazing angle, because the mip level the sampler picks is averaging whole
  // tiles. Swapping the deck for a plain colour made the bands vanish, which is
  // how I know it was the texture and not the geometry. A uniform surface has
  // nothing to band INTO.
  const deckGeo = new THREE.CircleGeometry(TERRACE.deckR, 64);
  // aoMap reads uv1, which CircleGeometry does not ship — so it is the same
  // coordinates as everything else rather than absent, which would render the
  // occlusion as a flat grey wash over the whole deck.
  deckGeo.setAttribute('uv1', deckGeo.getAttribute('uv'));
  const deck = new THREE.Mesh(
    deckGeo,
    new THREE.MeshStandardMaterial({ ...pbr('deck', { repeat: 5 }), roughness: 1.0, metalness: 1.0 }),
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
  // Roughness and metalness are left at 1 and multiplied DOWN by the ORM map —
  // that is how the packed workflow is meant to be driven, and setting them to
  // taste here would silently scale the measured values in the texture.
  const wallMat = new THREE.MeshStandardMaterial({
    // A cylinder's u runs the whole 30.8 m circumference and its v runs 1.05 m,
    // so one repeat count for both stretches the texture into horizontal
    // streaks. 30 across and 1 down puts a roughly square metre of concrete on
    // a square metre of wall, which is the only scale that ever looks right.
    ...pbr('wall', { repeat: 30, repeatY: 1 }), color: '#e6e2d8',
    roughness: 1.0, metalness: 1.0, side: THREE.DoubleSide,
  });
  const wallGeo = new THREE.CylinderGeometry(TERRACE.wallR, TERRACE.wallR, TERRACE.wallH, 64, 1, true);
  wallGeo.setAttribute('uv1', wallGeo.getAttribute('uv'));
  const wall = new THREE.Mesh(wallGeo, wallMat);
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

  planters(contact, group);
  group.add(skyline());
  group.add(seaLevel());

  scene.add(group);
  return group;
}

// Six planters around the parapet, out of his way and in his peripheral vision.
// They are the scale reference: a real potted plant beside an 18 cm sphere tells
// the eye what both of them are, which no amount of correct arc can do alone.
//
// They used to be a cylinder with four squashed spheres balanced on it, which is
// what "a plant" looks like when you are forbidden from downloading one. This is
// a photographed, modelled plant — CC0, Poly Haven — and it is the difference
// between a room with props in it and a room with placeholders in it.
//
// Loaded once and CLONED, not loaded six times: the clones share geometry and
// materials, so six plants cost six draw calls per mesh rather than six
// downloads. Instancing them into one call would be better still and is not
// worth the material rewiring for six objects.
export const PLANT_URL = '/ui/env/plant/plant.gltf';
const PLANT_AT = [-150, -105, -60, 60, 105, 150];

function planters(contact, group) {
  // The shadows go down immediately — they are ours, they are cheap, and a plant
  // that arrives without one looks like it is hovering.
  const shadows = new THREE.Group();
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: contact, transparent: true, depthWrite: false }),
  );
  const r = TERRACE.wallR - 0.62;
  for (const deg of PLANT_AT) {
    const a = deg * Math.PI / 180;
    const sh = quad.clone();
    sh.rotation.x = -Math.PI / 2;
    sh.position.set(Math.cos(a) * r, 0.004, Math.sin(a) * r);
    sh.scale.setScalar(0.95);
    shadows.add(sh);
  }
  group.add(shadows);

  new GLTFLoader().load(PLANT_URL, (gltf) => {
    const model = gltf.scene;
    // Poly Haven models arrive in metres and Y-up, which is what this room is
    // in — so no unit conversion, only the scale we actually want it at.
    for (const deg of PLANT_AT) {
      const a = deg * Math.PI / 180;
      const p = model.clone(true);
      p.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      // Turned to face the middle of the room, and each one a little different
      // in size: six identical plants at six identical angles reads as wallpaper.
      p.rotation.y = -a + Math.PI / 2 + (deg / 90);
      p.scale.setScalar(0.92 + ((Math.abs(deg) / 15) % 3) * 0.06);
      group.add(p);
    }
  }, undefined, (e) => {
    // No plants is a poorer room, not a broken one.
    console.warn('the plants did not load:', e);
  });
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
