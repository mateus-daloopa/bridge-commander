// sky.js — the light the room is made of.
//
// Everything else in this directory is arithmetic about where a thing stands.
// This is the one file about what the place FEELS like, and it turned out to
// matter more than any of the rest: a dark volume with a gradient band in it is
// a diagram of a room, and no amount of correct arc makes it somewhere you want
// to be. `world.md` asks for a *place* — bounded, with landmarks, that a person
// builds a mental map of — and a black void is the least place-like thing there
// is. It is possible to obey every number in the skill and still miss the point,
// and that is exactly what the first four versions of this room did.
//
// **It is drawn, not downloaded.** An equirectangular sky painted into a canvas
// at startup: no HDRI to fetch, nothing added to `ui/vendor/`, no build step,
// and it costs one texture. Then `PMREMGenerator` turns that same image into the
// scene's environment, so every surface in the room is lit BY the sky rather
// than by lights we placed — which is why the spheres stop looking like flat
// discs the moment it arrives.
//
// Painted with the canvas's own gradients rather than per-pixel: a 2048x1024
// equirect is two million pixels, and `createLinearGradient` is native code
// while a JS loop over an ImageData is not. Only the clouds are per-pixel, on a
// small buffer that is then drawn up — they are soft, so nobody can tell.
//
// **The sun is a landmark.** It sits behind the captain's left shoulder, which
// means it lights the faces of everything he looks at, and when he turns around
// it tells him which way he was facing. People build accurate mental maps from
// passive landmarks with no labels at all; this is the cheapest one in the room.

import * as THREE from 'three';

// Where the sun is, in the room's own degrees: azimuth positive to the right,
// elevation up from the horizon. Behind-left and well up — high enough not to
// be in his eyes when he turns, low enough to rake across the terrace.
export const SUN = { azDeg: -128, elDeg: 34 };

// Not white. A sun disc at full brightness in a headset is a thing people look
// away from, and the display cannot render it anyway — Meta's own note is to
// clamp toward #EBEBEB rather than pretend.
const SUN_COL = '#fff4dc';
const ZENITH = '#2f6ec4';
const HORIZON = '#cfe3f2';
const HAZE = '#e8f1f8';

export function sunDirection() {
  const a = SUN.azDeg * Math.PI / 180, e = SUN.elDeg * Math.PI / 180;
  return new THREE.Vector3(
    Math.sin(a) * Math.cos(e),
    Math.sin(e),
    -Math.cos(a) * Math.cos(e),
  );
}

// ---- the image -------------------------------------------------------------

// Value noise, summed over octaves. Small, seeded, and deliberately not a
// library: clouds want something that looks like weather, not something
// statistically defensible.
function fbm(w, h, octaves, seed) {
  const out = new Float32Array(w * h);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const step = 1 << (o + 2);
    const gw = step + 1, gh = Math.max(2, (step >> 1) + 1);
    const g = new Float32Array(gw * gh);
    // A cheap deterministic hash — the same sky every time the room opens, so
    // it is a place he can recognise rather than a new one each session.
    for (let i = 0; i < g.length; i++) {
      const n = Math.sin((i + 1) * 127.1 + seed * 311.7 + o * 74.7) * 43758.5453;
      g[i] = n - Math.floor(n);
    }
    for (let y = 0; y < h; y++) {
      const fy = (y / h) * (gh - 1), y0 = Math.floor(fy), ty = fy - y0;
      const y1 = Math.min(gh - 1, y0 + 1);
      for (let x = 0; x < w; x++) {
        // Wrapped in x, because an equirect that does not meet itself at the
        // seam is a vertical scar down the sky you cannot unsee.
        const fx = (x / w) * (gw - 1), x0 = Math.floor(fx), tx = fx - x0;
        const x1 = (x0 + 1) % (gw - 1);
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const a = g[y0 * gw + x0] + (g[y0 * gw + x1] - g[y0 * gw + x0]) * sx;
        const b = g[y1 * gw + x0] + (g[y1 * gw + x1] - g[y1 * gw + x0]) * sx;
        out[y * w + x] += (a + (b - a) * sy) * amp;
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function cloudCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const n = fbm(w, h, 5, 7);
  for (let y = 0; y < h; y++) {
    // Clouds live in a band above the horizon and thin out toward the zenith:
    // a sky with even cover everywhere reads as a ceiling, which is the exact
    // feeling this is here to avoid.
    const t = y / h;                      // 0 zenith, 1 nadir in the strip
    const band = Math.max(0, Math.sin(Math.min(1, Math.max(0, (t - 0.02) / 0.95)) * Math.PI)) ** 1.3;
    for (let x = 0; x < w; x++) {
      const v = n[y * w + x];
      // A hard-ish floor with a soft shoulder: below it there is clear sky, and
      // that separation is what makes them read as clouds rather than as fog.
      const a = Math.max(0, (v - 0.52) / 0.48) ** 1.4 * band;
      const i = (y * w + x) * 4;
      const shade = 232 + 23 * Math.min(1, a * 1.6);
      img.data[i] = shade; img.data[i + 1] = shade; img.data[i + 2] = 255;
      img.data[i + 3] = Math.min(255, a * 300) | 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// The equirectangular sky. x wraps azimuth, y runs zenith (0) to nadir (h).
export function skyTexture({ width = 2048 } = {}) {
  const w = width, h = width / 2;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  // Zenith to horizon to ground, in one native gradient.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0.00, ZENITH);
  g.addColorStop(0.30, '#5b96d8');
  g.addColorStop(0.46, HORIZON);
  g.addColorStop(0.50, HAZE);
  g.addColorStop(0.52, '#9aa7ad');
  g.addColorStop(1.00, '#4a5560');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // The clouds, in the upper half only, drawn up from a small buffer.
  const strip = cloudCanvas(512, 160);
  ctx.save();
  ctx.globalAlpha = 0.95;
  ctx.drawImage(strip, 0, h * 0.06, w, h * 0.42);
  ctx.restore();

  // The sun: a small disc inside a wide soft glow. The glow is what actually
  // sells it — a disc on a flat gradient reads as a sticker.
  const sx = ((SUN.azDeg / 360 + 1) % 1) * w;
  const sy = (0.5 - SUN.elDeg / 180) * h;
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, w * 0.11);
  glow.addColorStop(0, 'rgba(255,246,224,0.95)');
  glow.addColorStop(0.18, 'rgba(255,240,205,0.45)');
  glow.addColorStop(1, 'rgba(255,240,205,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(sx, sy, w * 0.11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = SUN_COL;
  ctx.beginPath(); ctx.arc(sx, sy, w * 0.011, 0, Math.PI * 2); ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- installing it ---------------------------------------------------------

// Background, environment and a sun, in one call. The PMREM pass is the whole
// point: it turns the sky image into the irradiance every MeshStandardMaterial
// in the room samples, which is what "lit by somewhere" means as opposed to
// "lit by three lights we put here".
export function installSky(renderer, scene, { width = 2048 } = {}) {
  const tex = skyTexture({ width });
  scene.background = tex;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const env = pmrem.fromEquirectangular(tex).texture;
  scene.environment = env;
  pmrem.dispose();

  // One directional light for the sun's own shadowless direction — the IBL
  // carries the ambient, so this is only here to give surfaces a bright side
  // and a dim one. No shadow map: it is the single most expensive thing a
  // mobile GPU can be asked for, and the contact darkening under the props is
  // a baked gradient instead.
  const sun = new THREE.DirectionalLight(new THREE.Color(SUN_COL), 1.6);
  sun.position.copy(sunDirection()).multiplyScalar(30);
  scene.add(sun);

  // A whisper of fill from below, so undersides are not black. Real ground
  // bounce, at the strength real ground bounce has.
  const bounce = new THREE.HemisphereLight(0xdfe9f5, 0x6b6355, 0.35);
  scene.add(bounce);

  return { texture: tex, environment: env, sun, bounce };
}

// Tone mapping, once, on the renderer. ACES is the one that keeps a bright sky
// from clipping to a white sheet, which is what an untone-mapped daylight
// gradient does the moment the sun is in frame.
export function installToneMapping(renderer) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Under 1.0 deliberately. The sky is bright and the panels are dark, and the
  // eye adapts to the brightest thing in the field — so a sky exposed for its
  // own sake is a sky that makes the prose in front of it hard to read.
  renderer.toneMappingExposure = 0.86;
}
