// main.js — the board as a world you stand inside.
//
// The first room was a wall of live terminals and the captain killed it in one
// sentence. The second was panels — pictures of the board hanging in the air.
// The third was shelves of card-shaped slabs, and he could point at them but
// could not read a word: they were 1.19:1 against the surface they stood on,
// which is not "small", it is invisible.
//
// This is the fourth, and the difference is that it is a room he can WORK in.
// What is permanently there is small and legible: the crew, an aligned floor,
// and a mat. Everything else arrives when he asks for it and leaves when he is
// done — a chat, the board, a card — and lives wherever he puts it.
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
import { Agents } from './agents.js';
import { ListPlate } from './list.js';
import { Rays, setVoice } from './hover.js';
import { Windows } from './windows.js';
import { ChatPanel } from './chat.js';
import { BoardPanel, CardPanel } from './board.js';
import { Grabs } from './grab.js';
import { Sound } from './sound.js';
import { installSky, installToneMapping } from './sky.js';
import { buildTerrace, crewInlay, setAnisotropy } from './place.js';
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
// view at reduced resolution. The board runs out to ±28° and a window he has
// placed himself can be anywhere, so the default would blur exactly the prose
// he is reading. A room of small type pays the GPU instead.
renderer.xr.setFoveation(0);
installToneMapping(renderer);
sortTransparent(renderer);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// Near at 0.3 m: closer than that a thing is intersecting his face, and nothing
// he reads is ever meant to be inside 0.5 m anyway.
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.3, 100);
camera.position.set(0, W.EYE, 0);
scene.add(camera);

// The sky, and the light it casts. Drawn into a canvas at startup and run
// through PMREM, so every surface here is lit BY somewhere rather than by
// lights we placed — see sky.js. One directional sun, one weak bounce, no
// shadow maps: a shadow map is the most expensive thing a mobile GPU can be
// asked for and the room buys nothing with it that a baked contact gradient
// does not.
const sky = installSky(renderer, scene);

// ---- the place, aligned to the real floor -----------------------------------
//
// Non-negotiable for orientation, and free: the session is `local-floor`, so
// y = 0 IS the floor he is standing on — and the terrace is built on it rather
// than floating over it.
setAnisotropy(renderer);
const terrace = buildTerrace(scene);
scene.add(crewInlay());

// ---- the room's contents ---------------------------------------------------

let doc = { cards: [], lieutenants: [], columns: [] };

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

// The room's sound. Armed by the gesture that enters it, because every browser
// refuses audio until the page has been touched once — which is why this is
// created here and started in enter() rather than on load.
const sound = new Sound();
setVoice(sound);

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
    onClose: (panel) => { sound.close(panel.group.position); windows.close(panel); },
  }));
  p.setTitle(lt.name || lt.id, 'chat');
  p.setTint(W.agentColour(lt.color));
  p.setFace(lt.avatar);
  p.paint(lt.chat);
  sound.open(p.group.position);
  return p;
}
agents.onSelect = openChat;

// The board: every card, filterable, and one press deep. It is its own size
// rather than the hand panel's, because its rows are targets and a 34° surface
// holds three of those.
function openBoard() {
  const fresh = !windows.find('board');
  const p = windows.show('board', () => new BoardPanel({
    onCard: openCard,
    onClose: (panel) => { sound.close(panel.group.position); windows.close(panel); },
  }));
  p.paint(doc);
  if (fresh) sound.open(p.group.position);
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
    onClose: (panel) => { sound.close(panel.group.position); windows.close(panel); },
  }));
  p.setTint(W.agentColour(lt && lt.color));
  p.setFace(lt && lt.avatar);
  p.paintCard(card, lt, cols.get(card.column));
  sound.open(p.group.position);
  return p;
}

function repaint() {
  const lts = new Map((doc.lieutenants || []).map((l) => [l.id, l]));
  agents.paint(doc);
  agents.paintLiveness(doc);
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
  // Inside the gesture, before any await: a browser only allows audio to start
  // from a real user action, and an await here would put us outside it.
  sound.start(DEV.get('track'));
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
    if (p) { windows.touch(p); sound.grab(p.group.getWorldPosition(new THREE.Vector3())); }
  });
  c.addEventListener('squeezeend', () => {
    const p = grabs.end(c);
    if (p) sound.drop(p.group.getWorldPosition(new THREE.Vector3()));
  });
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

// Scratch vectors for the ear update, allocated once: the loop runs 90 times a
// second and three Vector3s a frame is garbage the frame budget will notice.
const _ear = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();
const _q = new THREE.Quaternion();

let last = 0;
renderer.setAnimationLoop((t) => {
  const dt = last ? Math.min(0.1, (t - last) / 1000) : 0.016;
  last = t;
  rays.update();
  const now = performance.now();
  agents.tick(now);
  plate.tick(now);
  windows.tick(now);
  grabs.tick(dt);
  updateRoots(dt);
  // Inside a session the camera three.js renders with is the XR one, and it is
  // that transform the ears have to follow — the room's sounds are placed in
  // world coordinates and mean nothing without a listener that turns with him.
  const eye = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  eye.getWorldPosition(_ear);
  eye.getWorldDirection(_fwd);
  _up.set(0, 1, 0).applyQuaternion(eye.getWorldQuaternion(_q));
  sound.setEars(_ear, _fwd, _up);
  renderer.render(scene, camera);
});

// The handle the capture script and a console drive the room through.
window.__bridge = {
  agents, plate, scene, camera, rays, windows, grabs, sound, sky,
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
  // Named, or else the card with the most body on it — a photograph of an empty
  // card proves the frame renders and nothing about the prose in it.
  openCard: (id) => {
    const cards = doc.cards || [];
    const c = (id && cards.find((x) => x.id === id))
      || cards.slice().sort((a, b) => (b.body || '').length - (a.body || '').length)[0];
    return c ? !!openCard(c) : false;
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
