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

// The wall: four flat tiles on a 120° arc, one per board column. A shot cannot
// hold 120°, so the board's shot is framed on the two CENTRE lanes — the same
// reasoning that frames the crew on the middle pair of berths rather than on
// the whole arc — and a second shot is aimed at the outer lane, which is the
// one you turn your head for and therefore the one that proves the wall is a
// wall and that its far tiles are still square-on.
const LANE = [0, 1, 2, 3].map((i) => W.wallLaneAt(i));
const LANE_PAIR = { widthM: LANE[0].widthM * 2 + W.sizeForArc(W.WALL.laneGapDeg, W.WALL.distM), heightM: LANE[0].heightM };
const RAIL = W.railTileAt(0);          // the faces
const RAIL_R = W.railTileAt(1);        // the field, the clear and the close
// Dead ahead at the wall's own distance — where a surface stands when he opens
// one, and so what an empty room has to look right without.
const AHEAD = { x: 0, y: W.EYE, z: -W.WALL.distM };
// And the middle of the wall itself: dead ahead, but at the elevation the wall
// is CENTRED on rather than at the horizon. Aimed at AHEAD the shot came back
// half sky, which is a picture of the weather.
const WALL_MID = W.pointAt(0, W.wallElevDeg(), W.WALL.distM);

// The middle pair of berths, as one thing. A shot of the room at rest is framed
// on these rather than on the whole arc: the arc is 68.5° wide at 2 m and does
// not fit in a 90° frame with any margin left, so framing it would only ever
// assert that the shot is too small.
const CORE = {
  widthM: 2 * W.AGENT.distM * Math.sin((W.AGENT.pitchDeg / 2) * Math.PI / 180) + W.AGENT.diaM,
  heightM: W.sizeForArc(W.AGENT.riseDeg, W.AGENT.distM) + W.AGENT.diaM,
};
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
    why: 'the wall open, straight ahead: the two centre lanes, their column headers and their counts, and sixteen rows apiece at 32 characters of title — the shot the legibility count is taken on, and the one that says whether a title identifies a card or only hints at one',
    eye: HERE,
    // Dead ahead, which with four lanes is the seam between the two centre
    // ones — so the shot is the wall as he meets it rather than one tile with
    // its neighbours falling off both edges.
    look: at(WALL_MID),
    frames: { panel: LANE_PAIR, at: WALL_MID },
  },
  {
    name: 'wall-edge', scene: 'board',
    why: 'the outer lane, 47° off centre: the tile you turn your head for. Every tile stands at exactly the same radius and faces the head — this is the shot that says so, against a wide-angle frame that stretches whatever sits at its edge',
    eye: HERE,
    // A 46° turn, and it is declared rather than smuggled: a 120° wall is a
    // surface you READ BY TURNING, so its outer lane sits past the 45° a single
    // viewpoint is otherwise held to. That is the cost of the width, and the
    // shot exists to show what he gets for it.
    turn: W.WALL.spanDeg / 2,
    // The FIRST lane, not the last: it is the one carrying Backlog, and a
    // photograph of the empty end of the board proves nothing about type.
    look: at(LANE[0].pos),
    frames: { panel: { widthM: LANE[0].widthM, heightM: LANE[0].heightM }, at: LANE[0].pos },
  },
  {
    name: 'rail', scene: 'board',
    why: 'the filter rail under the wall: eight faces at the full hit floor, each one a press away from showing only that lieutenant\'s cards, plus the field and the clear — filtering with no typing anywhere in the gesture',
    eye: HERE,
    look: at(RAIL.pos),
    frames: { panel: { widthM: RAIL.widthM, heightM: RAIL.heightM }, at: RAIL.pos },
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

// `scene` says what has to be OPEN for the probe to have anything to land on:
// the wall and its rail do not exist until the mat has been pressed.
export const PROBES = [
  { name: 'a lieutenant', scene: 'world', yaw: -agent.az, pitch: agent.el, expect: 'lieutenant' },
  { name: 'the board mat', scene: 'world', yaw: -mat.azimuth, pitch: mat.elevation, expect: 'list-plate' },
  // A row on the wall — the sub-floor target, and so the one most worth
  // proving the ray can find. Lane zero is the first column's first lane, so
  // it is the one lane that has cards on any board worth photographing.
  {
    name: 'a wall row', scene: 'board', expect: 'wall-row',
    yaw: -LANE[0].az,
    pitch: W.wallExtent().topDeg - W.WALL.headDeg - 2 * W.WALL.rowDeg,
    reach: W.WALL.distM,
  },
  // A lane header, which is how a column filters itself. The aim is a little
  // under its own centre because the hand is held BELOW the head and its ray
  // therefore climbs — a probe pitched at the true centre lands above the top
  // edge, which is a real thing to know and not a fudge.
  {
    name: 'a lane header', scene: 'board', expect: 'wall-head',
    yaw: -LANE[3].az, pitch: W.wallExtent().topDeg - W.BUILD.hit, reach: W.WALL.distM,
  },
  // And a face on the rail, which is the whole point of the rail. The four
  // faces fill the left 31° of a 34° tile, so the tile's own centre is inside
  // the third of them — aiming at the middle of the upper strip lands on it.
  {
    name: 'a lieutenant\'s face', scene: 'board', expect: 'wall-face',
    yaw: -RAIL.az, pitch: W.RAIL.elevDeg + (W.BUILD.hit + W.BUILD.gap) / 2, reach: W.RAIL.distM,
  },
  // And the way OUT. Inside a headset the close on the rail is the only one
  // there is, so a wall you cannot shut is a wall you are stuck behind. It is
  // the last control on the right-hand tile's lower strip.
  {
    name: 'the way out', scene: 'board', expect: 'wall-x',
    yaw: -(RAIL_R.az + W.azSpan(W.RAIL.widthDeg, W.RAIL.elevDeg) / 2 - 2),
    pitch: W.RAIL.elevDeg - (W.BUILD.hit + W.BUILD.gap) / 2, reach: W.RAIL.distM,
  },
];

// Everywhere the room actually stands something — what a viewpoint is allowed to
// be aimed at. A viewpoint pointed anywhere else is a photograph of the floor.
export function places() {
  const out = [PLATE.pos, AHEAD, WALL_MID];
  for (const l of LANE) out.push(l.pos);
  for (let i = 0; i < W.RAIL.tiles; i++) out.push(W.railTileAt(i).pos);
  // The panel slots. Nothing stands in them until he opens something, but they
  // are where a window lands, so a shot aimed at one is a shot of the room.
  for (const az of W.PANEL_SLOTS) out.push(W.panelAt(az).pos);
  for (let i = 0; i < W.AGENT.slots; i++) out.push(W.agentAt(i).pos);
  return out;
}
