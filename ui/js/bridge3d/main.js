// main.js — the board as a world you stand inside.
//
// The first room was a wall of live terminals and the captain killed it in one
// sentence. The second was panels — better, and still 2D inside 3D: pictures of
// the board hanging in the air. This is the third, and the difference is that
// the things in it are THINGS. Four bounded shelves with their names on the
// floor beneath them, cards as slabs standing in slots, eight lieutenants as
// spheres at positions that never move, and a ray that lands on any of it.
//
// It is now a room he can work in rather than look at. The lieutenants are the
// arc above: point at one and its conversation opens as a panel he can read,
// type into and put where he likes. The mat on the floor opens the board —
// every card, filterable, one press deep — and a press on a card brings its
// body and its thread forward on a surface of their own. Squeeze a title bar to
// pick a window up; once he has placed it, the room never moves it again.
//
// Every number is authored in DEGREES and lives in `world.js`; why those are the
// numbers lives in the `vr-design` skill and nowhere else. See the README beside
// this file for how to run and photograph it without a headset.

import * as THREE from 'three';
import * as W from './world.js';
import { Shelf, Decal } from './shelves.js';
import { Agents } from './agents.js';
import { ListPlate } from './list.js';
import { Rays } from './hover.js';
import { Windows } from './windows.js';
import { ChatPanel } from './chat.js';
import { BoardPanel, CardPanel } from './board.js';
import { Grabs } from './grab.js';
import { updateRoots, sortTransparent, rootCount, COL } from './kit.js';

const say = (m) => { const el = document.getElementById('status'); if (el) el.textContent = m; };

// The dev loop's two switches, both off unless the URL asks — see README.md.
// `?capture=1` keeps the drawing buffer so a screenshot is not an empty PNG;
// `?xr=emulate` puts a headset that is not there behind navigator.xr. Neither
// costs the normal room anything: false IS WebGLRenderer's default for
// preserveDrawingBuffer, and devxr.js is not so much as fetched without the flag.
const DEV = new URLSearchParams(location.search);

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: DEV.has('capture') });
} catch (e) {
  say('no WebGL in this browser — ' + ((e && e.message) || e));
  throw e;
}
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
// three.js ships foveation at 1.0 — MAXIMUM — which renders the edges of the
// view at reduced resolution. This room parks two whole shelves out past 30° on
// purpose, for a head turn to find, so the default blurs exactly the things it
// was told to keep readable. A room of small type pays the GPU instead.
renderer.xr.setFoveation(0);
sortTransparent(renderer);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(COL.ink);
// Near at 0.3 m: closer than that a thing is intersecting his face, and nothing
// he reads is ever meant to be inside 0.5 m anyway.
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.3, 100);
camera.position.set(0, W.EYE, 0);
scene.add(camera);

// One hemisphere light and nothing else. A sphere with no shading is a disc, so
// the room needs SOME light — but dynamic lighting will exceed a mobile GPU and
// the frame budget here is 11 ms, so it is one baked gradient, no shadows, no
// point lights, and emissive is the only thing that ever changes.
scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x0a0f16, 2.1));

// ---- the ground, aligned to the real floor ---------------------------------
//
// Non-negotiable for orientation, and free: the session is `local-floor`, so
// y = 0 IS the floor he is standing on.
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(6, 48),
  new THREE.MeshBasicMaterial({ color: '#0a1018' }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const grid = new THREE.PolarGridHelper(6, 8, 6, 64, 0x16202c, 0x101823);
grid.material.opacity = 0.5;
grid.material.transparent = true;
scene.add(grid);

// ---- the room's contents ---------------------------------------------------

let doc = { cards: [], lieutenants: [], columns: [] };

const shelves = [];
const decals = [];
for (let i = 0; i < W.SHELF.azimuths.length; i++) {
  const s = new Shelf(i);
  const d = new Decal(i);
  shelves.push(s);
  decals.push(d);
  scene.add(s.group, d.group);
}

const agents = new Agents();
scene.add(agents.group);

// The mat on the floor ahead. It opens the BOARD — the one surface with every
// card on it, filterable, one press deep. There is no second flat list any
// more: two "every card" surfaces in one room is clutter he would have to
// learn his way around for no gain.
const plate = new ListPlate(() => openBoard());
scene.add(plate.group);

const rays = new Rays(renderer, scene, camera, renderer.domElement);

// ---- the windows -----------------------------------------------------------
//
// Panels are the readable half of the room. They are created on demand, they
// remember where he put them, and they are the only surfaces in here carrying
// prose — everything else is a thing you recognise rather than read.

const windows = new Windows(scene);
const grabs = new Grabs(scene);

// Click a lieutenant, get its chat. This is the shortest path between "I can
// see my crew" and "I am talking to them", and it is the whole reason the
// spheres were worth drawing.
function openChat(lt) {
  const key = 'lieutenant:' + lt.id;
  const p = windows.show(key, () => new ChatPanel({
    target: key,
    title: lt.name || lt.id,
    subtitle: 'chat',
    tint: W.agentColour(lt.color),
    onClose: (panel) => windows.close(panel),
  }));
  p.setTitle(lt.name || lt.id, 'chat');
  p.setTint(W.agentColour(lt.color));
  p.paint(lt.chat);
  return p;
}
agents.onSelect = openChat;

// The board: every card, filterable, and one press deep. It is its own size
// rather than the hand panel's, because its rows are targets and a 34° surface
// holds three of those.
function openBoard() {
  const p = windows.show('board', () => new BoardPanel({
    onCard: openCard,
    onClose: (panel) => windows.close(panel),
  }));
  p.paint(doc);
  return p;
}

// A card, with its body and its thread on one surface — the deliverable and the
// way to answer it, which are one thing.
function openCard(card) {
  const lts = new Map((doc.lieutenants || []).map((l) => [l.id, l]));
  const cols = new Map((doc.columns || []).map((c) => [c.id, c.title || c.id]));
  const lt = lts.get(card.owner);
  const p = windows.show('card:' + card.id, () => new CardPanel({
    card, tint: W.agentColour(lt && lt.color),
    onClose: (panel) => windows.close(panel),
  }));
  p.setTint(W.agentColour(lt && lt.color));
  p.paintCard(card, lt, cols.get(card.column));
  return p;
}

function repaint() {
  const cols = W.columnsOf(doc);
  const lts = new Map((doc.lieutenants || []).map((l) => [l.id, l]));
  shelves.forEach((s, i) => s.paint(doc, cols[i], lts));
  decals.forEach((d, i) => d.paint(doc, cols[i]));
  agents.paint(doc);
  // An open chat follows the board: the refresh is what makes a reply arrive
  // while he is standing there, rather than on the next time he opens it.
  const cardsById = new Map((doc.cards || []).map((c) => [c.id, c]));
  const colTitles = new Map((doc.columns || []).map((c) => [c.id, c.title || c.id]));
  for (const p of windows) {
    if (!p.open) continue;
    if (p.key === 'board') { p.paint(doc); continue; }
    let m = /^lieutenant:(.+)$/.exec(p.key || '');
    if (m) { const lt = lts.get(m[1]); if (lt) p.paint(lt.chat); continue; }
    m = /^card:(.+)$/.exec(p.key || '');
    if (m) {
      const c = cardsById.get(m[1]);
      if (c) p.paintCard(c, lts.get(c.owner), colTitles.get(c.column));
    }
  }
}

async function refresh() {
  try {
    doc = await fetch('/api/board').then((r) => r.json());
    repaint();
    say('');
  } catch (e) { say('the board did not answer: ' + ((e && e.message) || e)); }
}

// ---- entering --------------------------------------------------------------

const gate = document.getElementById('gate');

// The emulated headset installs itself over navigator.xr before anything asks
// navigator.xr a question, which is why this is started here and awaited in
// enter() rather than raced against the first click.
const emulated = DEV.get('xr') === 'emulate'
  ? import('./devxr.js').then((m) => m.install())
    .catch((e) => { say('the emulated headset did not install: ' + ((e && e.message) || e)); })
  : null;

async function enter() {
  if (emulated) await emulated;
  const flat = (why) => { say(why); gate.hidden = true; };
  if (!navigator.xr) return flat('no WebXR in this browser — flat view: drag to look, click to point');
  const ok = await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  if (!ok) return flat('no headset here — flat view: drag to look, click to point');
  let session;
  try {
    session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
    });
  } catch (e) { return flat('the headset refused the session: ' + ((e && e.message) || e)); }
  await renderer.xr.setSession(session);
  gate.hidden = true;
  rays.setPresenting(true);
  session.addEventListener('end', () => { gate.hidden = false; rays.setPresenting(false); });
}

// ---- squeeze to pick a window up -------------------------------------------
//
// Squeeze, not trigger: the trigger presses things and the grip moves them, and
// only a window's title bar answers a squeeze at all. Wired here rather than in
// grab.js because the controllers belong to the renderer's session and the ray
// that says what is under the hand belongs to `rays`.
for (const c of rays.controllers) {
  c.addEventListener('squeezestart', () => {
    const p = grabs.start(c, rays.hits.get(c));
    if (p) windows.touch(p);
  });
  c.addEventListener('squeezeend', () => grabs.end(c));
}
document.getElementById('enter').addEventListener('click', enter);

// ---- a desk, so this can be driven without a headset ------------------------
//
// Dragging turns the head; the mouse is the ray, through the same pointer
// library the controller uses, so a click at a desk and a trigger in a headset
// arrive at a target by the same route.

let dragging = false, yaw = 0, pitch = 0;
renderer.domElement.addEventListener('pointerdown', () => { dragging = true; });
window.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('pointermove', (e) => {
  if (!dragging || renderer.xr.isPresenting) return;
  yaw -= e.movementX * 0.003;
  pitch = Math.max(-1.3, Math.min(1.0, pitch - e.movementY * 0.003));
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
});
// Keystrokes belong to whatever composer has focus — a chat panel takes the
// keyboard when it opens, and Enter inside it sends. The shortcuts below are
// only for when nothing is being typed into, which is why they all check.
window.addEventListener('keydown', (e) => {
  const typing = document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
  if (typing) return;
  if (e.key === 'b') openBoard();
  if (e.key === 'c') { const lts = doc.lieutenants || []; if (lts[0]) openChat(lts[0]); }
  if (e.key === 'x') windows.closeFront();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- loop -------------------------------------------------------------------

let last = 0;
renderer.setAnimationLoop((t) => {
  const dt = last ? Math.min(0.1, (t - last) / 1000) : 0.016;
  last = t;
  rays.update();
  const now = performance.now();
  for (const s of shelves) s.tick(now);
  agents.tick(now);
  plate.tick(now);
  windows.tick(now);
  grabs.tick(dt);
  updateRoots(dt);
  renderer.render(scene, camera);
});

// The handle the capture script and a console drive the room through.
window.__bridge = {
  shelves, decals, agents, plate, scene, camera, rays, windows, grabs,
  openBoard: () => !!openBoard(),
  // The capture script and a console drive the panels through these — a chat
  // that can only be reached by aiming a ray is a chat no test can photograph.
  // Named, or else whoever has actually been talked to — a photograph of an
  // empty chat proves the frame renders and nothing about the prose in it.
  openChat: (id) => {
    const lts = doc.lieutenants || [];
    const lt = (id && lts.find((l) => l.id === id))
      || lts.slice().sort((a, b) => (b.chat || []).length - (a.chat || []).length)[0];
    return lt ? !!openChat(lt) : false;
  },
  panels: () => [...windows].filter((p) => p.open).map((p) => ({
    key: p.key, slot: p.slot, placed: p.placed,
    at: W.angleOf(p.group.position),
  })),
  stats: () => ({
    roots: rootCount(),
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    targets: targets().length,
  }),
  // What the ray is currently on, and how it is behaving about it. The capture
  // run reads this to prove the room is still pointable-at, which no photograph
  // can show.
  lit: () => targets().filter((t) => t.state !== 'idle')
    .map((t) => ({ name: t.name, state: t.state, distance: +t.distance.toFixed(2) })),
  get doc() { return doc; },
};

function targets() {
  const out = [];
  scene.traverse((o) => { if (o.userData && o.userData.target) out.push(o.userData.target); });
  return out;
}

refresh().then(() => { gate.classList.add('ready'); });
setInterval(refresh, 5000);
