// kit.js — the layout engine and the type, wired in once.
//
// Every surface in the old room was painted by hand onto a canvas, and every
// size on it was a number of pixels somebody had to convert back to degrees to
// know whether it was readable. That is gone. `@pmndrs/uikit` brings flexbox
// (Yoga) and MSDF text that stays sharp at any distance, vendored unmodified
// under `ui/vendor/` and reached through the page's import map.
//
// **Components are imported ONE AT A TIME, never the package barrel.** The
// barrel drags in the SVG component, which reaches for a three.js addon we do
// not vendor, and in the finished kits it pulls an icon set of 1,595 modules.
// Per-component is the intended workflow — see `building.md`.

// **uikit's `Input` is deliberately not here**, and the reason has been
// corrected: it is not that focusing a DOM input is fatal. It is not — the Quest
// system keyboard is supported inside a session from Browser 26.1 and the room
// raises it on purpose now (syskb.js). It is WHERE uikit puts the element. Its
// hidden input is parked at `left: -1000vw`
// (`ui/vendor/uikit/text/input/hidden-input.js`), and an off-screen text field
// is the one pitfall Meta's own doc names: the page scrolls to it the moment
// typing starts, so the flat board is somewhere else when he leaves the
// session. The room's own field is one transparent pixel INSIDE the viewport.
//
// The second reason stands on its own: an `Input` draws its own text with its
// own caret and selection, and nothing in this room is rendered by the browser.
// Text fields here are `Field` (field.js) — a Container, a Text, and a caret the
// room paints. Not importing it here is what keeps one out.
import { Container } from '../../vendor/uikit/components/container.js';
import { Text } from '../../vendor/uikit/components/text.js';
import { Image } from '../../vendor/uikit/components/image.js';
import { reversePainterSortStable } from '../../vendor/uikit/order.js';

export { Container, Text, Image, reversePainterSortStable };

// The glyph filter lives in `type.js` — no imports at all, so a test can load
// it — and comes back out of here, which is where every module already looks.
export { GLYPHS, safe, safeBlock } from './type.js';

// uikit's own unit is a "pixel", and `pixelSize` says what one is worth in the
// world. At 0.01 a layout unit is a centimetre, which is the size the room
// thinks in — so `width: 12` is 12 cm and `fontSize: 4.3` is a 4.3 cm em box.
export const PIXEL = 0.01;
export const cm = (m) => m / PIXEL;

// The room's palette. Dark plate, light type: 4.5:1 for body text and 3:1 for
// UI shapes, and nothing below #0D0D0D carries information because the panel
// cannot tell those levels from black.
export const COL = {
  shelf: '#111923',
  slot: '#161f2b',
  slotLit: '#22303f',
  slab: '#1d2836',
  text: '#c8d2e0',
  dim: '#8ea2c0',
  faint: '#5b6b82',
  accent: '#4cc2ff',
  ink: '#05070b',
  decal: '#2b3a4d',
  // The panels. A plate dark enough to carry light type can never itself reach
  // 3:1 against the room behind it, so the SHAPE of a panel is carried by its
  // rim and never by its fill: `rim` is 6.8:1 on the room's plate and `text` is
  // 9.9:1 on `panel`. Measured, not guessed.
  panel: '#0d1420',
  bar: '#18222f',
  barLit: '#26374a',
  rim: '#8ea2c0',
  field: '#111b27',
  mine: '#1b2b3d',
  // Something went wrong and he is wearing a headset, so there is no toolbar to
  // glance at and no toast to see. 10.3:1 on `panel` — measured, not guessed.
  warn: '#ffb454',
};

// Every root has to be told to lay itself out each frame. One registry rather
// than each module keeping its own, so main.js has one line in the loop.
const roots = new Set();

export function root(properties) {
  const c = new Container({ pixelSize: PIXEL, ...properties });
  roots.add(c);
  return c;
}

export function updateRoots(dt) { for (const r of roots) r.update(dt); }

export function rootCount() { return roots.size; }

// A font size in DEGREES, at the distance the surface stands — the only way a
// size gets authored in this room. Returns uikit's own units.
export function fontFor(deg, distM) { return cm(2 * distM * Math.tan(deg * Math.PI / 360)); }

// uikit panels are transparent and have to be sorted back to front, which is
// what this comparator is for. Set once, on the renderer.
export function sortTransparent(renderer) {
  renderer.setTransparentSort(reversePainterSortStable);
}

// Nothing uikit draws is a pointer target unless we say so — the ray in this
// room lands on slots, spheres and the panel's own controls, not on a glyph.
//
// It has to go through `setProperties` and not through the field: uikit rewrites
// `component.pointerEvents` out of its own properties on every effect pass, and
// a plain assignment survives exactly until the next one. That is how a shelf's
// glyph layer — a full-shelf plane sitting two millimetres in FRONT of the slots
// — quietly ate every ray in the room.
export function inert(object) {
  if (object.setProperties) object.setProperties({ pointerEvents: 'none' });
  else object.pointerEvents = 'none';
  return object;
}
