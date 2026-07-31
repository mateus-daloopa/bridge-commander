// main.js — the bridge, in a headset. A prototype, and it is meant to be torn up.
//
// The captain cannot judge a room he has not stood in, so this exists to be
// worn and disliked in specific ways. Everything in here is arranged so that a
// single session can kill three of the four ideas.
//
// The thesis it is testing, in one line: NEAR IS READABLE, FAR IS ALIVE. On a
// monitor every pane must be a terminal because there is only one distance. In
// a room there are many, and text you cannot read is not waste — it is
// peripheral vision.
//
// It reads the board's ordinary endpoints and opens the board's ordinary pane
// streams. There is no server code behind this page, deliberately: if the idea
// survives, it survives on the machinery that already exists.

import * as THREE from '../../vendor/three/three.module.min.js';
import { Pane3d } from './pane3d.js';
import { LAYOUTS, cardSlots, EYE } from './layouts.js';
import { targetsFrom } from './targets.js';
import { keyForEvent } from '../panekeys.js';

const PANE_MAX = 8;                    // the server's cap; see server.js
const say = (m) => { const el = document.getElementById('status'); if (el) el.textContent = m; };

// ---------- scene ----------

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
} catch (e) {
  // A browser with no WebGL used to sit on "loading…" forever, which reads as a
  // broken page rather than an unsupported one. Say which it is.
  say('no WebGL in this browser — ' + ((e && e.message) || e));
  throw e;
}
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#05070b');
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 100);
camera.position.set(0, EYE, 0);

// The rig is what the thumbstick turns. Turning the world instead of the head
// is the only comfortable way to reach a station behind you in a chair.
const rig = new THREE.Group();
scene.add(rig);

// A floor, faintly. Without one, distance stops reading at all — which would
// quietly sabotage the layout whose entire idea is distance.
const floor = new THREE.Mesh(
  new THREE.RingGeometry(0.4, 12, 48),
  new THREE.MeshBasicMaterial({ color: '#0f1622', side: THREE.DoubleSide, transparent: true, opacity: 0.55 }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const grid = new THREE.GridHelper(12, 24, 0x1d2a3d, 0x121b28);
scene.add(grid);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- knobs the captain turns while wearing it ----------
// These exist so a session produces a NUMBER rather than an impression: he
// tunes until it is readable and the HUD tells us the angle it took.
const k = { distance: 1, scale: 1, layout: 0, allText: false, fit: false };

// ---------- panes ----------

const anisotropy = renderer.capabilities.getMaxAnisotropy();
const panes = [];
let slabs = [];

async function build() {
  say('reading the board…');
  const doc = await fetch('/api/board').then((r) => r.json());
  const targets = targetsFrom(doc);
  if (!targets.length) { say('nothing is running — start a worker and reload'); return; }

  for (const t of targets) {
    const p = new Pane3d(t, anisotropy);
    panes.push(p);
    rig.add(p.group);
  }
  // PANE_MAX is a real server cap and a wall of panes is exactly what it exists
  // for. Over the line, a pane still takes its place in the room — it simply
  // never connects, and says so on its own face.
  panes.slice(0, PANE_MAX).forEach((p) => p.connect());
  panes.slice(PANE_MAX).forEach((p) => p.draw('over PANE_MAX (' + PANE_MAX + ') — not connected'));

  // Layout 4's slabs: one per card on the board, live only in that layout.
  const cards = (doc.cards || []).slice(0, 18);
  slabs = cards.map((c) => {
    const lt = (doc.lieutenants || []).find((l) => l.id === c.owner);
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.19, 0.13, 0.012),
      new THREE.MeshBasicMaterial({ color: new THREE.Color((lt && lt.color) || '#8ea2c0') }),
    );
    m.userData.card = c;
    m.visible = false;
    rig.add(m);
    return m;
  });

  arrange();
  say('');
  document.getElementById('gate').classList.add('ready');
}

function arrange() {
  const L = LAYOUTS[k.layout];
  const spots = L.place(panes, k);
  panes.forEach((p, i) => {
    const s = spots[i];
    if (!s) return;
    // Fit mode sizes every pane so its characters are actually readable at the
    // distance the layout put it. It is meant to be shocking: a 240-column tmux
    // window turns into a four-metre wall, which is the honest cost of reading
    // a full-width terminal in a headset and the argument for narrow panes.
    const dist = Math.hypot(s.pos.x, s.pos.z, s.pos.y - EYE);
    p.setSize(k.fit ? p.fitWidth(dist) * k.scale : s.size);
    p.group.position.set(s.pos.x, s.pos.y, s.pos.z);
    p.group.lookAt(0, EYE, 0);
  });
  const slots = cardSlots(slabs.length, k);
  slabs.forEach((m, i) => {
    m.visible = L.objects && !m.userData.held;
    if (!m.userData.held && slots[i]) {
      m.position.set(slots[i].x, slots[i].y, slots[i].z);
      m.lookAt(0, EYE - 0.3, 0);
    }
  });
  hudDirty = true;
}

// ---------- focus: what the head is pointed at ----------

const fwd = new THREE.Vector3();
const toPane = new THREE.Vector3();
const headPos = new THREE.Vector3();
let focused = null;

function updateFocus() {
  camera.getWorldPosition(headPos);
  camera.getWorldDirection(fwd);
  let best = null, bestDot = -1;
  for (const p of panes) {
    p.group.getWorldPosition(toPane);
    toPane.sub(headPos).normalize();
    const d = toPane.dot(fwd);
    if (d > bestDot) { bestDot = d; best = p; }
  }
  // ~28° half-angle. Wide enough that you do not have to aim, narrow enough
  // that exactly one thing is ever the terminal.
  const hit = bestDot > Math.cos(28 * Math.PI / 180) ? best : null;
  if (hit !== focused) { focused = hit; hudDirty = true; }
  for (const p of panes) p.setDetail(k.allText || p === focused ? 'text' : 'ambient');
}

// ---------- hud: the session has to produce a number ----------

const hudCanvas = document.createElement('canvas');
hudCanvas.width = 1024; hudCanvas.height = 256;
const hudTex = new THREE.CanvasTexture(hudCanvas);
hudTex.colorSpace = THREE.SRGBColorSpace;
hudTex.minFilter = THREE.LinearFilter;
hudTex.generateMipmaps = false;
const hud = new THREE.Mesh(
  new THREE.PlaneGeometry(0.42, 0.105),
  new THREE.MeshBasicMaterial({ map: hudTex, transparent: true, toneMapped: false }),
);
hud.position.set(0, -0.17, -0.62);
camera.add(hud);
scene.add(camera);
let hudDirty = true;

function drawHud() {
  const g = hudCanvas.getContext('2d');
  g.clearRect(0, 0, 1024, 256);
  g.fillStyle = 'rgba(6,10,16,.82)';
  g.fillRect(0, 0, 1024, 256);
  g.fillStyle = '#4cc2ff';
  g.font = '600 46px ui-monospace, monospace';
  g.fillText(LAYOUTS[k.layout].name, 24, 62);
  g.font = '38px ui-monospace, monospace';
  g.fillStyle = '#c8d2e0';
  if (focused) {
    focused.group.getWorldPosition(toPane);
    camera.getWorldPosition(headPos);
    const m = focused.metrics(toPane.distanceTo(headPos));
    g.fillText(focused.target.label, 24, 122);
    g.fillStyle = '#8ea2c0';
    g.fillText(m.cols + '×' + m.rows + '   ' + m.deg.toFixed(0) + '° wide   '
      + m.degPerChar.toFixed(2) + '°/char', 24, 178);
  } else {
    g.fillStyle = '#8ea2c0';
    g.fillText('look at a pane to read it', 24, 122);
  }
  g.fillStyle = '#5b6b82';
  g.font = '32px ui-monospace, monospace';
  g.fillText('dist ' + k.distance.toFixed(2) + '   size ' + k.scale.toFixed(2)
    + (k.allText ? '   ALL TEXT' : '') + (k.fit ? '   FIT TO READ' : ''), 24, 230);
  hudTex.needsUpdate = true;
  hudDirty = false;
}

// ---------- controllers ----------

const controllers = [];
for (let i = 0; i < 2; i++) {
  const c = renderer.xr.getController(i);
  const ray = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: 0x4cc2ff }),
  );
  ray.scale.z = 3;
  c.add(ray);
  scene.add(c);
  controllers.push(c);
}

const raycaster = new THREE.Raycaster();
const tmpMat = new THREE.Matrix4();

// Grab in layout 4: squeeze with the ray on a slab and it comes with your hand.
// Deliberately the crudest possible version — the question is whether holding
// work feels like anything, not whether the physics is good.
function grab(controller) {
  if (!LAYOUTS[k.layout].objects) return;
  tmpMat.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpMat);
  const hit = raycaster.intersectObjects(slabs.filter((s) => s.visible), false)[0];
  if (!hit) return;
  const m = hit.object;
  m.userData.held = controller;
  controller.attach(m);
}
function release(controller) {
  for (const m of slabs) {
    if (m.userData.held !== controller) continue;
    m.userData.held = null;
    rig.attach(m);
  }
}

const edge = new Map();      // gamepad button edge detection, per controller
function pressed(gp, i, id) {
  const now = !!(gp.buttons[i] && gp.buttons[i].pressed);
  const was = edge.get(id) || false;
  edge.set(id, now);
  return now && !was;
}

function readGamepads(dt) {
  const session = renderer.xr.getSession();
  if (!session) return;
  let hand = 0;
  for (const src of session.inputSources) {
    const gp = src.gamepad;
    if (!gp) continue;
    const side = src.handedness || ('h' + hand++);
    const ax = gp.axes || [];
    const x = ax.length > 2 ? ax[2] : (ax[0] || 0);
    const y = ax.length > 3 ? ax[3] : (ax[1] || 0);

    if (side === 'right') {
      if (pressed(gp, 4, 'r4')) { k.layout = (k.layout + 1) % LAYOUTS.length; arrange(); }
      if (pressed(gp, 5, 'r5')) { k.allText = !k.allText; hudDirty = true; }
      if (pressed(gp, 0, 'r0')) { k.fit = !k.fit; arrange(); }   // trigger: fit to read
      if (Math.abs(x) > 0.2) { rig.rotation.y += x * dt * 1.2; }        // turn the room
      if (Math.abs(y) > 0.2) { k.distance = clamp(k.distance - y * dt * 0.6, 0.4, 3); arrange(); }
    } else {
      if (pressed(gp, 4, 'l4')) { k.distance = 1; k.scale = 1; rig.rotation.y = 0; arrange(); }
      if (pressed(gp, 5, 'l5')) { k.layout = (k.layout + LAYOUTS.length - 1) % LAYOUTS.length; arrange(); }
      if (Math.abs(y) > 0.2) { k.scale = clamp(k.scale - y * dt * 0.7, 0.3, 4); arrange(); }
    }
  }
}
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

for (const c of controllers) {
  c.addEventListener('squeezestart', () => grab(c));
  c.addEventListener('squeezeend', () => release(c));
}

// ---------- keyboard: the pane you are facing is a real terminal ----------
// A paired keyboard is the input story for now; voice is a later card. What
// makes this a room you WORK in rather than a wall you watch is that the keys
// land in the thing you are looking at.

let sending = Promise.resolve();
window.addEventListener('keydown', (e) => {
  if (!focused) return;
  if (handleDesktopKey(e)) return;
  const payload = keyForEvent(e);
  if (!payload) return;
  e.preventDefault();
  const { input } = focused.streamUrl();
  sending = sending.then(() => fetch(input, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {}));
});

// The same knobs from a desk, so this can be checked without a headset on.
// Anything verified here is NOT evidence about legibility — that answer only
// exists inside the device.
function handleDesktopKey(e) {
  if (renderer.xr.isPresenting) return false;
  const map = { '1': 0, '2': 1, '3': 2, '4': 3 };
  if (e.key in map) { k.layout = map[e.key]; arrange(); return true; }
  if (e.key === 't') { k.allText = !k.allText; hudDirty = true; return true; }
  if (e.key === 'f') { k.fit = !k.fit; arrange(); return true; }
  if (e.key === '[') { k.scale = clamp(k.scale * 0.9, 0.3, 4); arrange(); return true; }
  if (e.key === ']') { k.scale = clamp(k.scale * 1.1, 0.3, 4); arrange(); return true; }
  if (e.key === '-') { k.distance = clamp(k.distance * 1.1, 0.4, 3); arrange(); return true; }
  if (e.key === '=') { k.distance = clamp(k.distance * 0.9, 0.4, 3); arrange(); return true; }
  return false;
}

// Desktop mouse-look, so the scene can be walked through on a flat screen.
let dragging = false, yaw = 0, pitch = 0;
renderer.domElement.addEventListener('pointerdown', () => { dragging = true; });
window.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('pointermove', (e) => {
  if (!dragging || renderer.xr.isPresenting) return;
  yaw -= e.movementX * 0.003;
  pitch = clamp(pitch - e.movementY * 0.003, -1.2, 1.2);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
});

// ---------- entering ----------

// A phone has no headset and no keyboard, and pressing a button that quietly
// does nothing reads as a broken page. So the gate says what it can do here,
// and where there is no immersive session it gets out of the way and hands over
// the flat room instead of refusing.
const gate = document.getElementById('gate');
const bar = document.getElementById('bar');

async function enter() {
  const flat = (why) => { say(why); gate.hidden = true; bar.hidden = false; };
  if (!navigator.xr) return flat('no WebXR in this browser — flat view, drag to look');
  const ok = await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  if (!ok) return flat('no headset here — flat view, drag to look');
  let session;
  try {
    session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
    });
  } catch (e) { return flat('the headset refused the session: ' + ((e && e.message) || e)); }
  await renderer.xr.setSession(session);
  gate.hidden = true;
  bar.hidden = true;
  session.addEventListener('end', () => { gate.hidden = false; bar.hidden = true; });
}
document.getElementById('enter').addEventListener('click', enter);

// The same four arrangements and the same two toggles, for a thumb.
bar.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.layout) {
    k.layout = Number(b.dataset.layout);
    for (const other of bar.querySelectorAll('[data-layout]')) other.classList.toggle('on', other === b);
    arrange();
    return;
  }
  if (b.id === 'b-alltext') { k.allText = !k.allText; b.classList.toggle('on', k.allText); hudDirty = true; }
  if (b.id === 'b-fit') { k.fit = !k.fit; b.classList.toggle('on', k.fit); arrange(); }
});

// ---------- loop ----------

let last = 0;
renderer.setAnimationLoop((t) => {
  const dt = last ? Math.min(0.1, (t - last) / 1000) : 0.016;
  last = t;
  readGamepads(dt);
  updateFocus();
  for (const p of panes) p.tick(dt);
  if (hudDirty) drawHud();
  renderer.render(scene, camera);
});
setInterval(() => { hudDirty = true; }, 250);   // the metrics move with your head

// A prototype is a thing you poke at from the console while wearing nothing.
// Deliberately exposed: `__bridge.k` is every knob, `__bridge.arrange()` applies
// them, `__bridge.panes` is the room.
window.__bridge = { k, panes, LAYOUTS, arrange, camera, get focused() { return focused; } };

build().catch((e) => say('could not build the room: ' + (e && e.message ? e.message : e)));
