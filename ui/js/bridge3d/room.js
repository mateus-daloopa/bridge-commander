// room.js — where things stand, and what standing there means.
//
// Pure: no three.js, no DOM. The room's policy is the part most likely to be
// wrong about the captain's habits, so it is the part that has to be arguable
// in a test rather than only in a headset.
//
// The captain's own model, in his order:
//
//   the LIEUTENANTS are always in front and never close — talking to one is the
//   interaction, and everything else is optional;
//   the BOARD is where he remembers what is in flight and decides where his
//   attention goes next, so it is always available but not always in front;
//   the WINDOWS are the work, as many as attention allows.
//
// Nothing is ever put behind him. Swapping has to cost a button press, never a
// neck movement — that is the whole reason "background" here means further away
// and dimmer rather than over your shoulder.

export const EYE = 1.45;

export const FRONT = { z: -1.55, y: EYE - 0.02, dim: 1 };
export const BACK = { z: -3.1, y: EYE + 0.32, dim: 0.55 };

// The bar sits low and close, under the conversation rather than in it — near
// enough to hit without aiming, far enough down not to cover a face.
export const BAR = { x: 0, y: EYE - 0.44, z: -0.92 };

// placeWindow(index, count) — where the n-th open window goes: an arc in front,
// widening as more open, never wrapping past the shoulders. Beyond that the
// captain is out of attention, which is his limit to set, not ours — so they
// stack rather than spiral out of reach.
export function placeWindow(index, count) {
  const perRow = 3;
  const row = Math.floor(index / perRow);
  const col = index % perRow;
  const inRow = Math.min(perRow, count - row * perRow);
  const spread = 46;                                    // degrees across a row
  const step = inRow > 1 ? spread / (inRow - 1) : 0;
  const a = ((inRow > 1 ? -spread / 2 + col * step : 0)) * Math.PI / 180;
  const radius = 1.35 + row * 0.28;
  return {
    x: Math.sin(a) * radius,
    y: EYE + 0.06 - row * 0.42,
    z: -Math.cos(a) * radius,
  };
}

// Which single thing is in front. The board and the windows share one front;
// the bar is not in the running because it never leaves.
//
// Opening something takes the front, because opening it IS the decision to work
// on it. Closing the front hands it back to the board — never to nothing, or
// the room would go empty in his hands.
export function nextFront(state, event) {
  const open = state.open || [];
  if (event.kind === 'open') return event.id;
  if (event.kind === 'close') {
    const rest = open.filter((id) => id !== event.id);
    if (state.front !== event.id) return state.front;
    return rest.length ? rest[rest.length - 1] : 'board';
  }
  if (event.kind === 'swap') return state.front === 'board' ? (open[open.length - 1] || 'board') : 'board';
  if (event.kind === 'focus') return event.id;
  return state.front;
}

// One window per thing. Clicking the same card twice brings it forward instead
// of opening a second copy of it — but the SAME lieutenant may be opened beside
// a card, because two chats with one agent at once is a thing he asked for.
export function openWindows(open, id) {
  return open.includes(id) ? open : open.concat([id]);
}
