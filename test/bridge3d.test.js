// The room's policy — where a window stands, and what standing in front means.
// Everything else in bridge3d needs a WebGL context and a head, and is checked
// by wearing it.
//
// The rules under test are the captain's, stated by him: the lieutenants are
// always in front, the board is where he decides what to look at next, the
// windows are the work, and nothing is ever put behind his head.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const UI = path.join(__dirname, '..', 'ui', 'js', 'bridge3d');
const load = (f) => import(path.join(UI, f));

test('every window stands in front of him — never behind, never inside him', async () => {
  const { placeWindow, EYE } = await load('room.js');
  for (let count = 1; count <= 9; count++) {
    for (let i = 0; i < count; i++) {
      const p = placeWindow(i, count);
      assert.ok(p.z < -0.6, `window ${i}/${count} is not in front (z=${p.z})`);
      const d = Math.hypot(p.x, p.z);
      assert.ok(d > 0.8 && d < 4, `window ${i}/${count} is at a silly distance (${d})`);
      assert.ok(Math.abs(p.y - EYE) < 1.2, `window ${i}/${count} is off over the horizon`);
      // Past the shoulders is a neck movement, and the whole point is that
      // reaching a window costs a glance.
      const deg = Math.abs(Math.atan2(p.x, -p.z) * 180 / Math.PI);
      assert.ok(deg < 60, `window ${i}/${count} sits ${deg.toFixed(0)}° off centre`);
    }
  }
});

test('windows do not land on top of each other', async () => {
  const { placeWindow } = await load('room.js');
  const seen = [];
  for (let i = 0; i < 6; i++) {
    const p = placeWindow(i, 6);
    for (const q of seen) {
      assert.ok(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) > 0.25, 'two windows in the same place');
    }
    seen.push(p);
  }
});

test('the background is further away, not over his shoulder', async () => {
  const { FRONT, BACK } = await load('room.js');
  assert.ok(BACK.z < FRONT.z, 'the back is further away');
  assert.ok(BACK.z < 0, 'the back is still in front of him — swapping costs a button, not a neck');
  assert.ok(BACK.dim < FRONT.dim, 'and it goes quiet');
});

test('opening a card takes the front; closing it hands the front back', async () => {
  const { nextFront, openWindows } = await load('room.js');
  let s = { open: [], front: 'board' };
  s.open = openWindows(s.open, 'card:a');
  s.front = nextFront(s, { kind: 'open', id: 'card:a' });
  assert.strictEqual(s.front, 'card:a', 'opening it IS the decision to work on it');

  s.open = openWindows(s.open, 'lt:monica');
  s.front = nextFront(s, { kind: 'open', id: 'lt:monica' });
  assert.strictEqual(s.front, 'lt:monica');

  s.front = nextFront(s, { kind: 'close', id: 'lt:monica' });
  s.open = s.open.filter((x) => x !== 'lt:monica');
  assert.strictEqual(s.front, 'card:a', 'the front falls back to what is still open');

  s.front = nextFront(s, { kind: 'close', id: 'card:a' });
  assert.strictEqual(s.front, 'board', 'and never to nothing — the room is not left empty in his hands');
});

test('closing something that was not in front leaves the front alone', async () => {
  const { nextFront } = await load('room.js');
  const s = { open: ['card:a', 'card:b'], front: 'card:b' };
  assert.strictEqual(nextFront(s, { kind: 'close', id: 'card:a' }), 'card:b');
});

test('the swap button goes both ways', async () => {
  const { nextFront } = await load('room.js');
  const s = { open: ['card:a'], front: 'board' };
  const away = nextFront(s, { kind: 'swap' });
  assert.strictEqual(away, 'card:a');
  assert.strictEqual(nextFront({ open: ['card:a'], front: away }, { kind: 'swap' }), 'board');
  // With nothing open there is nothing to swap to, and the board stays.
  assert.strictEqual(nextFront({ open: [], front: 'board' }, { kind: 'swap' }), 'board');
});

test('the same card twice is one window, brought forward', async () => {
  const { openWindows } = await load('room.js');
  const once = openWindows([], 'card:a');
  assert.deepStrictEqual(openWindows(once, 'card:a'), ['card:a']);
  // But a lieutenant beside a card is two windows — he asked for several chats
  // at once, with different agents or the same one twice.
  assert.deepStrictEqual(openWindows(once, 'lt:monica'), ['card:a', 'lt:monica']);
});

test('a panel at the front is legible: text that big subtends enough of the eye', async () => {
  const { PPM } = await load('surface.js');
  const { FRONT } = await load('room.js');
  assert.ok(PPM > 0, 'surface.js states its canvas pixels per metre');
  const BODY_PX = 21;                       // what panels.js paints body text at
  const metres = BODY_PX / PPM;
  const deg = 2 * Math.atan((metres / 2) / Math.abs(FRONT.z)) * 180 / Math.PI;
  // A Quest resolves ~20 px per degree. Half a degree of cap height is ~10 px,
  // which is where reading stops being work — the number the first prototype
  // was built to produce, now applied to the surfaces that actually matter.
  assert.ok(deg > 0.5, `front-panel body text is only ${deg.toFixed(2)}° tall`);
});
