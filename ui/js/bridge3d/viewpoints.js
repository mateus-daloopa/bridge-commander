// viewpoints.js — the handful of places the room is looked at from.
//
// Pure: the room's own constants and some trigonometry. No three.js, no DOM, no
// emulated headset. The page poses a head with these, the capture script names
// its PNGs after them, and the tests measure them — which is the only reason
// they are a module rather than six literals inside a script.
//
// A viewpoint is a place to STAND and a thing to LOOK AT, never a raw
// quaternion: the point of a named shot is "this is what the crew look like
// from where he reads them", and that survives the crew moving. Every target
// is read out of world.js, so a thing that gets repositioned drags its
// photograph along with it instead of quietly becoming a picture of the floor.

import * as W from './world.js';

const DEG = 180 / Math.PI;

// The emulated headset's vertical field of view, in degrees — IWER's own
// default, said out loud here because it is half of "is the thing this shot is
// named after actually IN the shot", which the tests measure.
export const FOVY = 90;

// Where a head at `eye` has to be turned to face `target`: yaw about Y, pitch
// about X, both in degrees. WebXR is right-handed with forward at -Z, so a head
// at rest is yaw 0 / pitch 0, positive yaw turns left and positive pitch looks
// up — the same convention IWER's eulerToQuat takes. (world.js measures azimuth
// positive to the RIGHT, which is the same angle with the opposite sign.)
export function aimAt(eye, target) {
  const dx = target[0] - eye[0], dy = target[1] - eye[1], dz = target[2] - eye[2];
  return {
    yaw: Math.atan2(-dx, -dz) * DEG,
    pitch: Math.atan2(dy, Math.hypot(dx, dz)) * DEG,
  };
}

export function gazeDistance(v) {
  return Math.hypot(v.look[0] - v.eye[0], v.look[1] - v.eye[1], v.look[2] - v.eye[2]);
}

// Standing where the captain stands. The room is authored around one head at the
// origin at eye height; a viewpoint that moved the body would be photographing a
// different room than the one the arc tests measure.
const HERE = [0, W.EYE, 0];

const at = (p) => [p.x, p.y, p.z];

// The arc of spheres, as one thing: eight of them 11.25° apart, so the set is
// 78.75° across at 2.0 m plus a sphere at each end.
const ARC = {
  widthM: 2 * W.AGENT.distM * Math.sin((W.AGENT.pitchDeg * (W.AGENT.slots - 1) / 2) * Math.PI / 180) + W.AGENT.diaM,
  heightM: W.sizeForArc(W.AGENT.riseDeg, W.AGENT.distM) + W.AGENT.diaM,
};

const BOARD = W.pointAt(0, W.BOARD.elevDeg, W.BOARD.distM);
// Dead ahead at the board's own distance — where a surface stands when he opens
// one, and so what an empty room has to look right without.
const AHEAD = { x: 0, y: W.EYE, z: -W.BOARD.distM };

// The middle pair of berths, as one thing. A shot of the room at rest is framed
// on these rather than on the whole arc: the arc is 68.5° wide at 2 m and does
// not fit in a 90° frame with any margin left, so framing it would only ever
// assert that the shot is too small.
const CORE = {
  widthM: 2 * W.AGENT.distM * Math.sin((W.AGENT.pitchDeg / 2) * Math.PI / 180) + W.AGENT.diaM,
  heightM: W.sizeForArc(W.AGENT.riseDeg, W.AGENT.distM) + W.AGENT.diaM,
};
const BOARD_SIZE = W.boardSize();
const PLATE = W.plate();

// The first panel slot, which is where a chat opened from a cold room lands.
const CHAT = W.panelAt(W.PANEL_SLOTS[0]);

// Each one exists to answer a question a screenshot can answer; anything a
// screenshot cannot answer is measured in test/bridge3d.test.js instead, and no
// photograph is a substitute for wearing it.
//
// `scene` is what has to be true for the shot to be of anything: 'world' is the
// room standing still; 'board', 'chat' and 'card' each open a surface that does
// not exist until somebody asks for it.
export const VIEWPOINTS = [
  {
    name: 'resting', scene: 'world',
    why: 'head level, dead ahead — the room with nothing open in it: the crew, the floor they stand on, the mat, and a horizon rather than a void. The shot that catches anything drifting up over the eyeline',
    eye: HERE,
    look: [0, W.EYE, -W.AGENT.distM],
    frames: { panel: CORE, at: W.agentAt(4).pos },
  },
  {
    name: 'lieutenants', scene: 'world',
    why: 'the arc: eight fixed berths, the crewed ones in their own colours with their names under them, nothing of it above +5°, and the ring on the floor that says where they live',
    eye: HERE,
    look: at(W.agentAt(3).pos),
    frames: { panel: ARC, at: W.agentAt(3).pos },
  },
  {
    name: 'landmarks', scene: 'world',
    why: 'the floor: the mat that opens the board, and the ring under the crew. The layout that lost in the research lost for lacking exactly these',
    eye: HERE,
    look: at(PLATE.pos), floor: true,
    frames: { panel: { widthM: PLATE.widthM, heightM: PLATE.depthM }, at: PLATE.pos },
  },
  {
    name: 'board', scene: 'board',
    why: 'the board open: every card, filterable, and each row a target the size of a target — can he read a title from where he stands, and is there air between two rows he might press',
    eye: HERE,
    look: at(BOARD),
    frames: { panel: BOARD_SIZE, at: BOARD },
  },
  {
    name: 'chat', scene: 'chat',
    why: 'a lieutenant\'s conversation, open where a chat opens: is the prose readable at 1.10 m, does the composer sit at the bottom, and is the title bar a bar he could actually grab',
    eye: HERE,
    look: at(CHAT.pos),
    frames: { panel: { widthM: CHAT.widthM, heightM: CHAT.heightM }, at: CHAT.pos },
  },
  {
    name: 'card', scene: 'card',
    why: 'a card brought forward: its id, its PR state, the body that IS the deliverable, and the thread under it — the surface he came into the room to read',
    eye: HERE,
    look: at(CHAT.pos),
    frames: { panel: { widthM: CHAT.widthM, heightM: CHAT.heightM }, at: CHAT.pos },
  },
];

export const byName = (name) => VIEWPOINTS.find((v) => v.name === name) || null;

// ---- things the ray has to be able to land on -------------------------------
//
// A photograph proves the room did not go blank. It says nothing at all about
// whether the ray reaches anything, and the way that breaks is silent: a glyph
// layer two millimetres in front of the slots, an invisible panel that is still
// a collider, a pointer library that rewrites the flag you set. Every one of
// those looks perfect in a PNG.
//
// So the capture run also POINTS at one of each kind of thing and checks it
// lights up. Aim is a head pose, in the same degrees everything else here
// speaks: yaw is the opposite sign of world.js's azimuth.
const agent = W.agentAt(4);
const mat = W.plate();

export const PROBES = [
  { name: 'a lieutenant', yaw: -agent.az, pitch: agent.el, expect: 'lieutenant' },
  { name: 'the board mat', yaw: -mat.azimuth, pitch: mat.elevation, expect: 'list-plate' },
];

// Everywhere the room actually stands something — what a viewpoint is allowed to
// be aimed at. A viewpoint pointed anywhere else is a photograph of the floor.
export function places() {
  const out = [BOARD, PLATE.pos, AHEAD];
  // The panel slots. Nothing stands in them until he opens something, but they
  // are where a window lands, so a shot aimed at one is a shot of the room.
  for (const az of W.PANEL_SLOTS) out.push(W.panelAt(az).pos);
  for (let i = 0; i < W.AGENT.slots; i++) out.push(W.agentAt(i).pos);
  return out;
}
