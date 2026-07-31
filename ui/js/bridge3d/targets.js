// targets.js — who gets a place in the room.
//
// Its own module, and pure, for the same reason ansi.js and panekeys.js are:
// main.js grabs a WebGL context at import time and a unit test cannot, but the
// question of WHICH panes belong in the room is exactly the kind of judgement
// that should be pinned by a test rather than by squinting at a headset.
//
// The rule that matters: a card keeps its `session` attribute long after the
// worker is gone, so "has a session" would fill the room with ghosts — twenty
// finished review cards, all dark, all claiming a place. Only a card in
// `working` is actually running.

const PANE_WINDOW = /^[A-Za-z0-9_.-]{1,80}$/;

function windowsOf(at) {
  const v = at.pane;
  const list = Array.isArray(v) ? v : (typeof v === 'string' ? v.split(',') : []);
  return list.map((w) => String(w).trim()).filter((w) => PANE_WINDOW.test(w));
}

// A lieutenant has no column of its own, so it inherits the nearest claim its
// cards make on the captain. That is what makes the depth layout mean anything:
// something waiting in review pulls its owner right up to his face.
function columnFor(cards) {
  if (cards.some((c) => c.column === 'review')) return 'review';
  if (cards.some((c) => c.column === 'working')) return 'working';
  return cards.length ? 'backlog' : 'done';
}

export function targetsFrom(doc) {
  const cards = (doc && doc.cards) || [];
  const lts = (doc && doc.lieutenants) || [];
  const out = [];

  // Running work first: a lieutenant is always there, a running worker is the
  // thing the captain came in to watch, and PANE_MAX decides who connects.
  for (const c of cards) {
    const at = c.attributes || {};
    if (c.column !== 'working' || !at.session) continue;
    const lt = lts.find((l) => l.id === c.owner);
    out.push({
      kind: 'cards',
      id: c.id,
      window: windowsOf(at)[0],
      label: c.title ? c.title.replace(/^[^\w]+\s*/, '').slice(0, 34) : c.id,
      color: (lt && lt.color) || '#8ea2c0',
      column: 'working',
    });
  }

  for (const l of lts) {
    if (!l.ref || !l.ref.session) continue;
    out.push({
      kind: 'lieutenants',
      id: l.id,
      label: l.name || l.id,
      color: l.color || '#4cc2ff',
      column: columnFor(cards.filter((c) => c.owner === l.id)),
    });
  }
  return out;
}
