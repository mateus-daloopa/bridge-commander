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
//
// `wall` is the odd one out and it is bigger than HEAD: the wall is read at a
// glance while the head is turning, and the captain set its floor himself at
// 1.3° of cap. 2.00 × 0.72 = 1.44° — and the margin over 1.3 is not slack, it
// is FORESHORTENING. A 44° flat tile is compressed at its top edge by 10% of
// what the same type covers at the middle, so the row that decides the number
// is the top one, and it lands at 1.33°. See `wallCap()`, which measures it.
export const CAP = 0.72;
export const TYPE = { head: 2.0, body: 1.4, meta: 1.15, wall: 2.00 };

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

// ---- the wall -------------------------------------------------------------
//
// The board was a single flat panel 56° wide carrying eight rows, and eight of
// sixty-eight is not a board, it is a peephole with a search box attached. The
// captain's verdict was that filtering to see your own board is useless. He is
// right, and the fix is not a bigger panel: **a panel becomes a wall.**
//
// A wall is a run of FLAT TILES laid along an arc — flat text on each tile,
// curved surface overall, which is what "text stays flat" actually buys you.
// One tile per LANE. A tile 18.6° wide is 9.3° off-normal at its edges, which
// costs 1.3% of its width to foreshortening and nothing to legibility.
//
// ---- the arithmetic, and it is the whole design ---------------------------
//
// Three numbers were fixed before anything was placed, and everything else
// falls out of them:
//
//   · 1.3° of CAP height AT THE WORST ROW, which the captain set. Cap is 0.72
//     of the em box, and the top row of a 44° tile is foreshortened to 0.90 of
//     what the middle covers — so the em box is 2.00° and a line of it is
//     2.00 × 1.15 = 2.30°.
//   · 2.72° of row pitch — that line, plus 0.42° of padding and air.
//   · 120° of azimuth, which is the widest a wall can be before its ends are
//     behind the shoulders, and about as far as a neck turns comfortably.
//
// VERTICALLY: the tallest a surface gets in this room is +10° to -34°, on the
// ceiling and inside the floor. That is 44°. The lane header takes one 6.06°
// hit floor, leaving 37.94°, and 37.94 / 2.72 is **13 rows**.
//
// HORIZONTALLY: six lanes with 1.66° of air between them is (120 - 5×1.66)/6 =
// **18.62° per lane**. Inside that, 1.4° of padding, a 1.0° owner bar and 0.4°
// of gap leave 15.8° of title, and at 2.00° em with Inter's measured 0.494
// mean advance that is **16 characters**.
//
// So the wall holds 6 × 13 = **78 rows**, and on the live board — 35 backlog,
// 4 working, 31 in review — it shows **56 cards at once with no filter**,
// against eight before.
//
// ---- and what it cost, said out loud --------------------------------------
//
// 16 characters of title, against 47 on the old board. And a 2.72° row is
// UNDER the 6.06° hit floor: a wall row is aimed at, not swiped at. Both are
// direct consequences of the 1.3° cap the captain named — at the room's own
// body size (1.4° em, 1.0° cap) the same wall carries 19 rows a lane and 23
// characters of title. One constant, `TYPE.wall`, moves between the two.
//
// The mitigation for the sub-floor row is the one the six hover states exist
// for: the row lights up before the trigger is pulled, so a mis-aim is visible
// and correctable, and the worst outcome is a card he closes again. Everything
// he presses DELIBERATELY — a lane header, a lieutenant's face, the field, the
// clear — is the full 6.06° and is not on the wall at all; it is on the rail.
export const WALL = {
  distM: 1.50,
  lanes: 6,
  spanDeg: 120,                     // total azimuth, ends included
  topDeg: 10,
  bottomDeg: -34,
  // NOT tilted. A hand panel is tilted back 15° so its face points up at the
  // eye; a lane is 44° tall and no tilt makes both of its ends face you. What
  // the tilt does do is throw the top edge away from the eye and squash the top
  // rows: 15° of it cost the worst row 21% of its cap height and put the wall's
  // top behind the crew. Turned to face the eye and left there is what a wall
  // wants.
  tiltDeg: 0,
  rowDeg: 2.72,
  headDeg: BUILD.hit,               // the lane header is pressed: it filters
};

// 1.50 m and not the 2.6 m this was first drawn at, and 8° of tilt rather than
// the panels' 15°. Both numbers were paid for by a rendered frame.
//
// The arc is what a person perceives and it is identical at any distance, so
// the distance is decided by what ELSE is in the room. The crew stand at 2.0 m.
// A 44° tile tilted 15° back does not put its top edge at the distance it
// stands: the tilt throws the top AWAY from the eye, and at 1.80 m that edge
// measured 2.11 m — behind the crew, who drew straight through the wall's top
// rows in the photograph. Nearer and flatter fixes it: at 1.50 m and 8°, the
// furthest point on the wall is 1.69 m and the crew is in front of nothing.
//
// It also has to clear the parapet at 4.90 m by a wide margin and stay inside
// the room's own comfort band, which ends at FAR. 1.50 m does all of it.

// What the wall really covers, once it has been turned to face the eye and
// tilted. A flat surface 44° tall does not subtend 44° symmetrically — its
// lower half is nearer and so bigger in the eye — and the tilt shifts the whole
// thing. Both facts bit, so the extremes are derived here rather than read off
// `topDeg` and `bottomDeg`, and the tests measure THESE.
//
// The arithmetic is in the vertical plane through a lane's centre, with the eye
// at the origin: `s` along the line of sight, `u` the tile's own up.
function wallSeen(h) {
  const el = wallElevDeg() * D, t = WALL.tiltDeg * D;
  const s = [Math.cos(el), Math.sin(el)];               // [horizontal, up]
  const u = [-Math.sin(el), Math.cos(el)];
  const p = [WALL.distM * s[0] + h * Math.cos(t) * u[0] + h * Math.sin(t) * s[0],
    WALL.distM * s[1] + h * Math.cos(t) * u[1] + h * Math.sin(t) * s[1]];
  return { deg: Math.atan2(p[1], p[0]) / D, dist: Math.hypot(p[0], p[1]) };
}

export function wallExtent() {
  const half = sizeForArc(wallHeightDeg(), WALL.distM) / 2;
  const top = wallSeen(half), bottom = wallSeen(-half);
  return {
    topDeg: top.deg, bottomDeg: bottom.deg,
    maxDistM: Math.max(top.dist, bottom.dist, WALL.distM),
  };
}

// The cap height a title really covers, row by row, and the two ends of it.
//
// `TYPE.wall × CAP` is what the type is CUT at; it is not what the eye gets.
// A row near the top of the tile is further away and turned further from the
// line of sight, so it covers less arc than the same row at the middle — 10%
// less across a 44° lane, and the captain's 1.3° floor has to hold on the
// worst of them, not the best. This is the figure the tests assert and the
// figure the rendered frame was checked against.
export function wallCap() {
  const half = sizeForArc(wallHeightDeg(), WALL.distM) / 2;
  const head = sizeForArc(WALL.headDeg, WALL.distM);
  const row = sizeForArc(WALL.rowDeg, WALL.distM);
  const cut = TYPE.wall * CAP;
  let worst = Infinity, best = 0;
  for (let k = 0; k < wallRows(); k++) {
    const h = half - head - k * row;
    const seen = (wallSeen(h).deg - wallSeen(h - row).deg) / WALL.rowDeg;
    worst = Math.min(worst, cut * seen);
    best = Math.max(best, cut * seen);
  }
  return { cutDeg: cut, worstDeg: worst, bestDeg: best };
}

export function wallLaneDeg() {
  return (WALL.spanDeg - (WALL.lanes - 1) * BUILD.gap) / WALL.lanes;
}
export function wallHeightDeg() { return WALL.topDeg - WALL.bottomDeg; }
export function wallElevDeg() { return (WALL.topDeg + WALL.bottomDeg) / 2; }

// How many rows fit under the header, at the row pitch.
export function wallRows() {
  return Math.max(1, Math.floor((wallHeightDeg() - WALL.headDeg) / WALL.rowDeg));
}
export function wallSeats() { return wallRows() * WALL.lanes; }

export function wallLaneSize() {
  return {
    widthM: sizeForArc(wallLaneDeg(), WALL.distM),
    heightM: sizeForArc(wallHeightDeg(), WALL.distM),
  };
}

// Where lane `i` stands. The lane pitch is authored as TRUE ARC and converted
// to azimuth at the wall's centre elevation, so the 1.66° of air between two
// neighbouring rows is 1.66° as the eye sees it — and because the conversion
// fans outward as it goes down, the gap only ever grows away from the centre.
export function wallLaneAt(i) {
  const step = azSpan(wallLaneDeg() + BUILD.gap, wallElevDeg());
  const az = (i - (WALL.lanes - 1) / 2) * step;
  const el = wallElevDeg();
  return { az, el, dist: WALL.distM, tilt: WALL.tiltDeg, pos: pointAt(az, el, WALL.distM), ...wallLaneSize() };
}

// Characters of title a lane holds, once the padding, the owner bar and its
// gap are out of the way. 0.494 em is Inter's measured mean advance over real
// card titles.
export const WALL_ROW_CHROME = 2.8;        // padding + owner bar + gap, degrees
export function wallChars(emDeg = TYPE.wall) {
  return Math.floor((wallLaneDeg() - WALL_ROW_CHROME) / (emDeg * 0.494));
}

// Which lanes belong to which board column. Every column gets one, so an empty
// column still has a header and a count and does not silently vanish; the
// lanes left over go to whichever column is most over-subscribed, one at a
// time. On the live board — 35 / 2 / 31 / 0 — that is 2 / 1 / 2 / 1.
//
// It is recomputed when the wall is OPENED and never while he is looking at
// it. A layout that re-shares its lanes on the five-second refresh would move
// the row he is reaching for, and "where did I put that thing" is the failure
// that kills these rooms.
export function wallLanesFor(counts) {
  const lanes = counts.map(() => 1);
  for (let spare = WALL.lanes - counts.length; spare > 0; spare--) {
    let best = 0;
    for (let i = 1; i < counts.length; i++) {
      if (counts[i] / lanes[i] > counts[best] / lanes[best]) best = i;
    }
    lanes[best]++;
  }
  return lanes;
}

// ---- the rail --------------------------------------------------------------
//
// Filtering by typing is not filtering, it is a search box. The rail is where
// one press does it: the eight lieutenants' FACES, which is the honest use for
// them — they came off the rows this morning for being noise at 90 of them,
// and here each one is a control at the full 6.06° hit floor. Press a face,
// the wall is that lieutenant's; press it again, it clears.
//
// It sits BELOW the wall and NEARER, at 1.20 m, because at the wall's own
// distance the same elevation is underground: 1.80 m at -50° is 0.07 m below
// the deck. Near and low is also where a control belongs — you glance down at
// it, the way you glance down at the mat, and the whole reading band above
// stays spent on cards.
export const RAIL = {
  distM: 1.20,
  elevDeg: -44.5,
  tiltDeg: 15,
  tiles: 2,
  widthDeg: 34,                     // each tile
  rows: 2,
  padDeg: 0.6,                      // and the tile's own margin, both sides
};

// The padding is IN the height, not decoration on top of it. Left out, the two
// 6.06° strips plus their air came to exactly the tile's height, the padding
// pushed the second strip past the bottom edge, and the clear and the close
// were simply not there — a control squeezed out of its container looks the
// same as a control that is merely small.
export function railHeightDeg() {
  return RAIL.rows * BUILD.hit + (RAIL.rows - 1) * BUILD.gap + 2 * RAIL.padDeg;
}

export function railSize() {
  return {
    widthM: sizeForArc(RAIL.widthDeg, RAIL.distM),
    heightM: sizeForArc(railHeightDeg(), RAIL.distM),
  };
}

export function railTileAt(i) {
  const step = azSpan(RAIL.widthDeg + BUILD.gap, RAIL.elevDeg);
  const az = (i - (RAIL.tiles - 1) / 2) * step;
  return {
    az, el: RAIL.elevDeg, dist: RAIL.distM, tilt: RAIL.tiltDeg,
    pos: pointAt(az, RAIL.elevDeg, RAIL.distM), ...railSize(),
  };
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
