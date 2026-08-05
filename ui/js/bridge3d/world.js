// world.js — where every thing in the room stands, said in degrees first.
//
// Pure: no three.js, no uikit, no DOM. Everything here is arithmetic about a
// head at the origin, so the room's geometry is arguable in a test rather than
// only in a headset.
//
// What is CORRECT — the arc a target has to cover, how far a thing stands, what
// earns being an object rather than a panel — lives in the `vr-design` skill and
// its `world.md`. This file is the room BUILT to those numbers; it does not
// restate the reasoning, it cites it.
//
// The one line that governs the whole thing: **give a thing a place, not a
// space.** Four bounded shelves that never move, a landmark on the floor under
// each, objects in slots on a surface, and the third axis deliberately spent on
// nothing at all.
//
// ---- the angles, and where they come from ---------------------------------
//
// A degree is the only unit a person perceives. Every figure below is authored
// in degrees and turned into metres at the distance the thing actually sits —
// which for a shelf tilted back from vertical is NOT the shelf's own radius, so
// slot positions are found by intersecting a gaze ray with the shelf plane and
// the distance falls out of that.

const D = Math.PI / 180;

export const EYE = 1.45;                 // eye height above the real floor, metres

export function arcDeg(sizeM, distM) { return 2 * Math.atan(sizeM / (2 * distM)) * 180 / Math.PI; }
export function sizeForArc(deg, distM) { return 2 * distM * Math.tan(deg * D / 2); }

// A sphere is not a flat card: what it covers is set by its radius against the
// line of sight, so the radius that subtends `deg` is a sine and not a tangent.
export function sphereForArc(deg, distM) { return distM * Math.sin(deg * D / 2); }

// Em-box degrees. The floor is 0.7° of CAP height; `meta`, the smallest thing
// painted anywhere in the room, is 1.15 × 0.72 = 0.83°, clear of it.
export const CAP = 0.72;
export const TYPE = { head: 2.0, body: 1.4, meta: 1.15 };

// The floors, corrected. 3° is the floor for the DRAWN MARK and it is not a
// specification for the hit box: a hand-held ray scatters to an effective width
// of 3.7°–6°, so a 3° collider is missed a good fraction of the time by somebody
// aiming correctly. Draw at 3°, pad the responsive region to 6°, and keep 1.6°
// of clear air between two of them.
export const MARK = 3.0;
export const HIT = 6.0;
export const GAP = 1.6;

// And this is what the room BUILDS to. A figure constructed to land exactly on
// its floor lands a rounding error under it about half the time, so everything
// is cut a hair over and the floor stays the floor.
export const BUILD = { mark: MARK + 0.06, hit: HIT + 0.06, gap: GAP + 0.06 };

// Nothing readable comes nearer than NEAR — discomfort rises exponentially as
// content approaches the face — and past FAR the eyes work at a depth the fixed
// focal plane cannot meet.
export const NEAR = 0.5;
export const FAR = 2.0;

// Looking up is the fastest route to a sore neck. RISE is the ceiling for
// anything at all; DROP is where a surface he READS is centred; FLOOR_LOOK is
// how far down a glance may go for a thing that is on the actual floor, because
// the floor is where floors are and a landmark on it cannot be raised.
export const RISE = 10;
export const DROP = [15, 20];
export const SINK = 35;
export const FLOOR_LOOK = 60;

// ---- the lattice ----------------------------------------------------------
//
// Everything interactive in this room sits on one angular lattice, and the
// lattice pitch is the floor: a 6.06° responsive region with 1.66° of air beside
// it. That is 7.72°, and it is the number the whole layout is built out of.
export const PITCH = BUILD.hit + BUILD.gap;                 // 7.72°

// Eight spheres, one per lieutenant, in an arc over the shelves: 0° at the ends
// rising to +5° in the middle, never higher. Fixed positions that never sort and
// never reflow — eight is small enough that a stable arc becomes a memorised
// landmark set, and that is the whole win.
export const AGENT = {
  slots: 8,
  diaM: 0.18,                                               // 5.16° at 2.0 m
  distM: 2.0,
  pitchDeg: 11.25,
  riseDeg: 5,
};

// The roster fills the arc from the middle outward, in a fixed order, so a
// lieutenant joining never moves one that is already there and a half-crewed
// board is still centred rather than piled against the left wall.
export const AGENT_ORDER = [3, 4, 2, 5, 1, 6, 0, 7];

// And the thing you point at to summon it: a mat on the floor, nearer than the
// ring of decals, dead ahead. It is the one thing in the room that sits below
// the band everything readable is held to, and that is deliberate — the whole
// ±45° by +10°/−35° budget is spent on shelves and lieutenants, there is no
// lane wide enough left in it, and a control you glance down at once in a while
// is not a surface you read. It is still inside the −60° a neck will go to.
export const PLATE = { azimuthDeg: 0, radiusM: 1.12, widthDeg: BUILD.hit * 2, heightDeg: BUILD.hit };

// ---- the panels, where prose is actually read ------------------------------
//
// Text stays flat. Nobody in twenty-seven years of immersive analytics made an
// abstract 3D visualisation of text data, and Meta, Microsoft and Apple say the
// same thing independently — so a card body, a chat and a report are PANELS,
// and the only question is where they stand and how big they are.
//
// 1.10 m, because comfort peaks between 1.0 and 2.0 m and this is the near end
// of that: prose is the thing you lean into. Centred 16° below the horizon,
// which is where the eyes rest. And TILTED BACK 15° from vertical, so the face
// points up at the eye rather than presenting a keystone — a panel lying flat
// is foreshortened into uselessness and makes you bow your head to read it.
//
// Panels stand INSIDE everything else in the room. A surface parked behind the
// objects is in the dark, at the wrong distance, competing for the same line of
// sight with the things in front of it.
// 34° tall rather than the 28° this started at, and the extra six degrees are
// not decoration: the bar and the composer are both targets, so both are the
// 6.06° hit floor tall, and they eat 12° of any panel before a word of prose is
// drawn. At 28° that left seven lines of body, which is a peephole. At 34°,
// centred at -16°, the panel spans -33° to +1° — clear of the -35° floor below
// and nowhere near the +10° ceiling above — and the body holds eleven lines.
export const PANEL = {
  distM: 1.10,
  elevDeg: -16,
  tiltDeg: 15,
  widthDeg: 34,
  heightDeg: 34,
};

// Where an unplaced panel lands. There are TWO, and that is the whole list.
//
// **Two panels is the ceiling, and it is arithmetic rather than taste**: at
// 34° each they span ±34.5° of the ±45° a comfortable field has. A third has
// nowhere to go — a slot far enough out not to overlap these two puts its
// outer edge past 45°, and past 33.75° a flat panel turned to face the eye
// stops facing it anyway.
//
// So the room does not pretend to offer more. Open a third and it lands on the
// least recently touched of the two, because refusing to open is worse than
// overlapping something he can pick up and move. Where windows go BEYOND two is
// his business, not the room's: once he places one himself, the room never
// touches it again, and he can carry as many as his attention will hold.
export const PANEL_SLOTS = [-17.5, 17.5];

// The board is not a hand panel and it cannot be one. Its rows are things he
// PRESSES, so each is the 6.06° hit floor tall with 1.66° of air beside it —
// and a 34° panel has room for three of those, which is not a board, it is a
// keyhole. So the board gets its own surface: wider, taller, and a little
// further out, carrying two columns of five.
//
// 56° x 44° at 1.35 m, centred 13° below the horizon: it spans ±28° of azimuth
// and -35° to +9° of elevation, which is the TALLEST a surface can be in this
// room — one degree under the +10° ceiling and exactly on the -35° floor. Two
// columns of four, because at the 7.72° lattice pitch that is what fits once
// the bar and the filter have taken their two 6.06° hit floors out of the
// height, and eight is what is left.
//
// Eight of sixty-four sounds thin and is not: the rows are newest-first, nine
// cards on the live board were touched in the last day, and the filter is one
// field away. A third column would buy twelve rows at 18.7° each — 32
// characters of title instead of 47 — and a title he has to guess at is worse
// than four fewer rows.
export const BOARD = {
  distM: 1.35,
  elevDeg: -13,
  tiltDeg: 15,
  widthDeg: 56,
  heightDeg: 44,
  cols: 2,
};

export function boardSize() {
  return {
    widthM: sizeForArc(BOARD.widthDeg, BOARD.distM),
    heightM: sizeForArc(BOARD.heightDeg, BOARD.distM),
  };
}

// How many rows fit, at the lattice pitch, in whatever height is left once the
// bar and the filter have taken their hit floors.
export function boardRows() {
  const body = BOARD.heightDeg - 2 * BUILD.hit;
  return Math.max(1, Math.floor(body / PITCH));
}

export function panelSize() {
  return {
    widthM: sizeForArc(PANEL.widthDeg, PANEL.distM),
    heightM: sizeForArc(PANEL.heightDeg, PANEL.distM),
  };
}

// Where a panel in a given slot stands, and which way it faces. `tilt` is
// applied about the panel's own horizontal axis after it has been turned to
// face the eye, so a panel off to the side is tilted in ITS frame and not in
// the room's — otherwise the two outer slots lean sideways.
export function panelAt(azDeg) {
  return {
    az: azDeg, el: PANEL.elevDeg, dist: PANEL.distM, tilt: PANEL.tiltDeg,
    pos: pointAt(azDeg, PANEL.elevDeg, PANEL.distM),
    ...panelSize(),
  };
}

// What the panel can actually hold, said in characters rather than in metres —
// the figure that decides whether a card body is readable or a scrolling chore.
// 0.494 em is Inter's measured mean advance over real card titles and bodies.
export function panelCapacity(bodyDeg = TYPE.body) {
  return {
    charsPerLine: Math.floor(PANEL.widthDeg / (bodyDeg * 0.494)),
    lines: Math.floor(PANEL.heightDeg / (bodyDeg * 1.4)),
  };
}

// ---- pointing -------------------------------------------------------------
//
// dir(azimuth, elevation) — a unit vector, in the WebXR convention: forward is
// −Z, +Y is up, and azimuth is measured POSITIVE TO THE RIGHT. (viewpoints.js
// hands a head a yaw, which is the same angle with the opposite sign.)
export function dir(azDeg, elDeg) {
  const a = azDeg * D, e = elDeg * D;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
}

// A degree of AZIMUTH is not a degree of ARC anywhere but the horizon. Two
// points at the same elevation, one azimuth degree apart, are only cos(el) of a
// degree apart as the eye sees it — so a 6° collider laid out by azimuth on the
// bottom row of a shelf arrives at 5.2°, which is exactly the kind of quiet
// shortfall this whole file exists to prevent. Everything horizontal is
// therefore authored as TRUE arc and converted to azimuth here, which makes the
// slot lattice fan outward as it goes down. The identity is exact:
//
//   trueArc = 2·asin( cos(el) · sin(azSpan/2) )
export function azSpan(trueDeg, elDeg) {
  const s = Math.sin(trueDeg * D / 2) / Math.cos(elDeg * D);
  return s >= 1 ? 180 : 2 * Math.asin(s) / D;
}

export function pointAt(azDeg, elDeg, distM) {
  const d = dir(azDeg, elDeg);
  return { x: d[0] * distM, y: EYE + d[1] * distM, z: d[2] * distM };
}

// Where a point stands, said back in the room's own units.
export function angleOf(p) {
  const x = p.x || 0, y = (p.y === undefined ? EYE : p.y) - EYE, z = p.z || 0;
  const flat = Math.hypot(x, z);
  return {
    az: Math.atan2(x, -z) / D,
    el: Math.atan2(y, flat) / D,
    dist: Math.hypot(flat, y),
  };
}

export function eyeDistance(p) { return angleOf(p).dist; }

// ---- the lieutenants ------------------------------------------------------

export function agentSlotAzimuth(slot) {
  return (slot - (AGENT.slots - 1) / 2) * AGENT.pitchDeg;
}

// The arc: 0° at the ends, +5° in the middle, and never higher than that.
export function agentSlotElevation(slot) {
  const az = agentSlotAzimuth(slot);
  const end = agentSlotAzimuth(AGENT.slots - 1);
  return AGENT.riseDeg * (1 - (az / end) ** 2);
}

export function agentAt(slot) {
  const az = agentSlotAzimuth(slot), el = agentSlotElevation(slot);
  return { slot, az, el, dist: AGENT.distM, pos: pointAt(az, el, AGENT.distM) };
}

// Which slot a lieutenant owns — by its place in the board's own roster, filled
// from the middle out, and never re-sorted for any reason.
export function agentSlotFor(index) {
  return index < AGENT_ORDER.length ? AGENT_ORDER[index] : -1;
}

// Full white is uncomfortably bright and the display cannot do anything useful
// with it; the spec's own note is to clamp it to about #EBEBEB.
export function agentColour(hex) {
  const c = String(hex || '#8aa0bb').trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(c);
  if (!m) return '#8aa0bb';
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.min(v, 0xeb));
  return '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join('');
}

// ---- the mat on the floor --------------------------------------------------

export function plate() {
  const r = PLATE.radiusM;
  const d = dir(PLATE.azimuthDeg, 0);
  const pos = { x: d[0] * r, y: 0, z: d[2] * r };
  const a = angleOf(pos);
  // On the floor, a degree of elevation is worth a great deal more radial metres
  // than a degree of azimuth is worth across — so the plate that reads as square
  // in the eye is a long rectangle on the ground, and it is derived rather than
  // eyeballed.
  return {
    pos, azimuth: PLATE.azimuthDeg, elevation: a.el, dist: a.dist,
    widthM: 2 * r * Math.sin(azSpan(PLATE.widthDeg, a.el) * D / 2),
    depthM: PLATE.heightDeg * D * (r * r + EYE * EYE) / EYE,
  };
}

// ---- the six states --------------------------------------------------------
//
// There is no haptic channel, so the visual channel carries the affordance
// alone: remove the signifier and 36% of people do not know where to press.
// Four vendors mandate six states rather than three, and the proximity
// treatment worth copying is a spotlight that SHRINKS as the hand approaches,
// converging to a dot on contact — the fix for having no depth certainty.
export const STATE = ['idle', 'hovered-far', 'hovered-near', 'contact', 'held', 'released'];

// How near is near. A ray has no fingertip, so the distance the spotlight reads
// is how far down the ray the thing sits: something across the room glows wide,
// something you have walked up to closes to a dot. Inside NEAR_M the hover is
// the near treatment, and it carries the distance rather than merely saying
// "hovered" — which is the whole difference between three states and six.
export const REACH_M = [0.30, 2.20];
export const NEAR_M = 1.0;

export function spotlight(distanceM) {
  const [a, b] = REACH_M;
  const k = Math.max(0, Math.min(1, (distanceM - a) / (b - a)));
  return 0.14 + 0.86 * k;                 // fraction of the target's own half-width
}

// Acknowledge inside 100 ms; Quest 3 spends 70 ms on hand tracking before the
// event arrives, so the room's own budget is what is left of it.
export const ACK_MS = 150;
export const STEP = 1.05;                 // the ~5% scale step a hover is worth
