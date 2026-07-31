// layouts.js — four arrangements of the same panes, to be argued with.
//
// Each one is a claim about what a room is for, and three of them are wrong.
// They are deliberately built to the same crude standard so that the winner
// wins on the idea rather than on polish.
//
// A layout returns, for each pane, where it sits and how big it is in metres.
// Facing is not its business: everything turns to face the head, always.

const EYE = 1.45;                      // metres above the floor, seated-ish
const D2R = Math.PI / 180;

function onArc(i, n, spreadDeg, radius, y) {
  const step = n > 1 ? spreadDeg / (n - 1) : 0;
  const a = (n > 1 ? -spreadDeg / 2 + i * step : 0) * D2R;
  return { x: Math.sin(a) * radius, y, z: -Math.cos(a) * radius };
}

// 1 — COCKPIT. One concave surface wrapped around you; head turn changes
// subject. The baseline: what a flat board gives you for free once it is bent.
// If this wins, we learn something cheap and true.
function cockpit(panes, k) {
  const n = panes.length;
  const radius = 2.0 * k.distance;
  return panes.map((p, i) => ({
    pos: onArc(i, n, Math.min(150, 34 * Math.max(1, n - 1)), radius, EYE),
    size: 1.5 * k.scale,
  }));
}

// 2 — STATIONS. Each worker is a PLACE, not a rectangle. It is always in the
// same direction, so you learn the room the way you learn a workshop and stop
// navigating altogether. The bet.
function stations(panes, k) {
  const n = panes.length;
  const radius = 1.9 * k.distance;
  return panes.map((p, i) => {
    const a = (i / Math.max(1, n)) * 300 * D2R - 150 * D2R;   // a gap behind you
    return {
      pos: { x: Math.sin(a) * radius, y: EYE, z: -Math.cos(a) * radius },
      size: 1.5 * k.scale,
    };
  });
}

// 3 — DEPTH AS PROGRESS. The columns stop being columns and become
// distance: backlog far off, working at arm's reach, review in your face, done
// drifting away behind your shoulder. Most native to the medium, most likely to
// be unreadable — which is exactly why it has to be tried rather than argued.
const DEPTH = {
  review: { d: 1.25, spread: 40, y: EYE + 0.05 },
  working: { d: 2.3, spread: 70, y: EYE },
  backlog: { d: 6.0, spread: 110, y: EYE + 0.35 },
  done: { d: 3.2, spread: 60, y: EYE - 0.1, behind: true },
};
function depth(panes, k) {
  const byCol = new Map();
  for (const p of panes) {
    const col = DEPTH[p.target.column] ? p.target.column : 'working';
    if (!byCol.has(col)) byCol.set(col, []);
    byCol.get(col).push(p);
  }
  const out = new Map();
  for (const [col, list] of byCol) {
    const c = DEPTH[col];
    list.forEach((p, i) => {
      const at = onArc(i, list.length, c.spread, c.d * k.distance, c.y);
      if (c.behind) { at.z = -at.z; at.x = -at.x; }
      out.set(p, { pos: at, size: 1.5 * k.scale * (c.d / 2.3) });
    });
  }
  return panes.map((p) => out.get(p));
}

// 4 — CARDS AS OBJECTS. The panes retreat to a back wall and the work itself
// comes within reach as slabs you can pick up. Ten seconds of holding one
// settles whether this is the future or a gimmick.
function objects(panes, k) {
  const n = panes.length;
  const radius = 3.0 * k.distance;
  return panes.map((p, i) => ({
    pos: onArc(i, n, Math.min(170, 40 * Math.max(1, n - 1)), radius, EYE + 0.5),
    size: 1.5 * k.scale,
  }));
}

export const LAYOUTS = [
  { id: 'cockpit', name: 'cockpit — one bent surface', place: cockpit, objects: false },
  { id: 'stations', name: 'stations — every worker a place', place: stations, objects: false },
  { id: 'depth', name: 'depth — progress is distance', place: depth, objects: false },
  { id: 'objects', name: 'objects — cards in your hands', place: objects, objects: true },
];

// Where the grabbable card slabs live in layout 4: a shallow table arc at
// forearm height, close enough to reach without standing up.
export function cardSlots(n, k) {
  const out = [];
  const radius = 0.62 * k.distance;
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 6);
    const col = i % 6;
    const per = Math.min(6, n - row * 6);
    const at = onArc(col, per, 70, radius + row * 0.22, EYE - 0.45 - row * 0.02);
    out.push(at);
  }
  return out;
}

export { EYE };
