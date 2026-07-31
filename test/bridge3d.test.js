// The two pure halves of the headset prototype: who gets a place in the room,
// and where the room puts them. Everything else in bridge3d needs a WebGL
// context and a head, and is checked by wearing it.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const UI = path.join(__dirname, '..', 'ui', 'js', 'bridge3d');
const load = (f) => import(path.join(UI, f));

// A board mid-life: one worker actually running, a shelf of finished review
// cards that all still carry the session they were started with, and a
// lieutenant whose session has gone.
const DOC = {
  lieutenants: [
    { id: 'monica', name: 'Monica', color: '#4cc2ff', ref: { session: 'bc-lt-monica' } },
    { id: 'waldir', name: 'Waldir', color: '#f5a', ref: { session: 'bc-lt-waldir' } },
    { id: 'freya', name: 'Freya', color: '#3d8', ref: { session: 'bc-lt-freya' } },
    { id: 'ghost', name: 'Ghost', color: '#888' },
  ],
  cards: [
    { id: 'live', title: '📐 A drawing artifact', owner: 'monica', column: 'working',
      attributes: { session: 'bc-lt-monica:w-live', pane: 's-impl,s-val' } },
    { id: 'done-1', title: 'old review', owner: 'waldir', column: 'review',
      attributes: { session: 'bc-lt-waldir:w-done-1' } },
    { id: 'idea', title: 'someday', owner: 'freya', column: 'backlog', attributes: {} },
  ],
};

test('a finished card keeps its session, and must not keep its place in the room', async () => {
  const { targetsFrom } = await load('targets.js');
  const ids = targetsFrom(DOC).filter((t) => t.kind === 'cards').map((t) => t.id);
  assert.deepStrictEqual(ids, ['live'], 'only a card in working is actually running');
});

test('a lieutenant with no session is not in the room at all', async () => {
  const { targetsFrom } = await load('targets.js');
  const ids = targetsFrom(DOC).filter((t) => t.kind === 'lieutenants').map((t) => t.id);
  assert.deepStrictEqual(ids, ['monica', 'waldir', 'freya']);
});

test('a lieutenant inherits the nearest claim its cards make — review pulls it close', async () => {
  const { targetsFrom } = await load('targets.js');
  const by = Object.fromEntries(targetsFrom(DOC).filter((t) => t.kind === 'lieutenants').map((t) => [t.id, t.column]));
  assert.strictEqual(by.waldir, 'review', 'something is waiting on the captain');
  assert.strictEqual(by.monica, 'working', 'busy, but not asking for anything');
  assert.strictEqual(by.freya, 'backlog', 'holding work that has not started');
});

test('running work comes before the lieutenants — PANE_MAX cuts from the far end', async () => {
  const { targetsFrom } = await load('targets.js');
  assert.strictEqual(targetsFrom(DOC)[0].id, 'live');
});

test('only a window the card advertised can be watched', async () => {
  const { targetsFrom } = await load('targets.js');
  const one = targetsFrom(DOC).find((t) => t.id === 'live');
  assert.strictEqual(one.window, 's-impl');

  const evil = JSON.parse(JSON.stringify(DOC));
  evil.cards[0].attributes.pane = 'other-session:0';
  const hacked = targetsFrom(evil).find((t) => t.id === 'live');
  assert.strictEqual(hacked.window, undefined, 'a target with a colon in it is not a window name');
});

test('every layout places every pane, in front of the seated head', async () => {
  const { LAYOUTS } = await load('layouts.js');
  const panes = ['review', 'working', 'working', 'backlog', 'done']
    .map((column, i) => ({ target: { column, label: 'p' + i } }));
  for (const L of LAYOUTS) {
    const spots = L.place(panes, { distance: 1, scale: 1 });
    assert.strictEqual(spots.length, panes.length, L.id + ' dropped a pane');
    for (const s of spots) {
      assert.ok(Number.isFinite(s.pos.x) && Number.isFinite(s.pos.y) && Number.isFinite(s.pos.z),
        L.id + ' put a pane nowhere');
      assert.ok(s.size > 0.1 && s.size < 12, L.id + ' sized a pane absurdly');
      const d = Math.hypot(s.pos.x, s.pos.z);
      assert.ok(d > 0.3 && d < 20, L.id + ' put a pane inside the captain or in the next county');
    }
  }
});

test('depth really does put review nearer than backlog — that is the whole idea', async () => {
  const { LAYOUTS } = await load('layouts.js');
  const depth = LAYOUTS.find((l) => l.id === 'depth');
  const panes = [{ target: { column: 'review' } }, { target: { column: 'backlog' } }];
  const [near, far] = depth.place(panes, { distance: 1, scale: 1 });
  assert.ok(Math.hypot(near.pos.x, near.pos.z) < Math.hypot(far.pos.x, far.pos.z));
});

test('a pane with an unknown column still lands somewhere sensible', async () => {
  const { LAYOUTS } = await load('layouts.js');
  const depth = LAYOUTS.find((l) => l.id === 'depth');
  const [spot] = depth.place([{ target: { column: 'nonsense' } }], { distance: 1, scale: 1 });
  assert.ok(spot && Number.isFinite(spot.pos.z));
});

test('fit-to-read prices legibility honestly: a wide terminal needs an absurd wall', async () => {
  // A Pane3d needs a DOM to construct, so only the constant comes across; the
  // arithmetic it drives is restated here, because that arithmetic IS the
  // finding — measured on a real frame, 240 columns came to 0.221°/char, which
  // is about half of what a Quest can resolve comfortably.
  const { READABLE } = await load('pane3d.js');
  assert.ok(READABLE > 0.3 && READABLE < 0.6, "a glyph wants 8-10 of a headset's ~20 px per degree");
  const degWide = (cols) => cols * READABLE;
  assert.ok(degWide(240) > 90, 'a full-width tmux window eats the whole field of view');
  assert.ok(degWide(100) < 50, 'a narrow pane fits beside its neighbours');
});
