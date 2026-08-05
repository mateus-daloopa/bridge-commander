// sky.js — the light the room is made of.
//
// Everything else in this directory is arithmetic about where a thing stands.
// This is the one file about what the place FEELS like, and it turned out to
// matter more than any of the rest: a dark volume with a gradient band in it is
// a diagram of a room, and no amount of correct arc makes it somewhere you want
// to be. `world.md` asks for a *place* — bounded, with landmarks, that a person
// builds a mental map of — and a black void is the least place-like thing there
// is. It is possible to obey every number in the skill and still miss the point.
//
// **It is a photograph now, not a drawing.** The first version painted an
// equirect sky into a canvas, because this repo's culture is "no build step"
// and I had quietly turned that into "no assets" — which was never the rule. A
// server that already serves static files serves an HDRI without any build step
// at all. So: a real 2k HDR sky, CC0, from Poly Haven, run through
// `PMREMGenerator` so every surface in the room is lit BY it rather than by
// lights we placed. That is the single biggest quality jump available and it
// replaced about a hundred lines of hand-rolled noise.
//
// **The sun direction is derived from the image, not guessed.** The brightest
// region of the HDR was found by reading the file and taking a luminance-
// weighted centroid around the peak; it lands at 48° of elevation, which is
// exactly what the asset's own name claims, so the reading is trustworthy. The
// directional light points there, which is why the shading on the spheres
// agrees with the sun he can actually see behind his right shoulder.

import * as THREE from 'three';
import { RGBELoader } from '../../vendor/three/loaders/RGBELoader.js';

export const SKY_URL = '/ui/env/sky.hdr';

// Measured from the image (see the note above), converted into the room's own
// convention: azimuth positive to the RIGHT, forward at -Z. It comes out behind
// his right shoulder, which is where you want a sun — it lights the faces of
// everything he turns to look at, and when he turns round it tells him which way
// he was facing. The cheapest landmark in the room.
export const SUN = { azDeg: 124.2, elDeg: 48.0 };

export function sunDirection() {
  const a = SUN.azDeg * Math.PI / 180, e = SUN.elDeg * Math.PI / 180;
  return new THREE.Vector3(
    Math.sin(a) * Math.cos(e),
    Math.sin(e),
    -Math.cos(a) * Math.cos(e),
  );
}

// What the room looks like for the second or two before 5.4 MB of sky arrives.
// A flat colour rather than a gradient: it is on screen briefly and its only job
// is to not be black, because a black first frame is the old room and he has
// seen enough of that one.
const HOLDING = '#a8c6e4';

// Background, environment and a sun. Returns synchronously with the room
// already lit well enough to stand in, and upgrades itself when the HDR lands —
// nothing waits on the network before the first frame.
export function installSky(renderer, scene) {
  scene.background = new THREE.Color(HOLDING);

  // A sun, immediately, at the direction the image will confirm. The IBL carries
  // the ambient once it arrives; this gives every surface a bright side and a
  // dim one from the first frame. No shadow map — it is the most expensive
  // thing a mobile GPU can be asked for, and the baked contact gradients under
  // the props buy the same reading for one transparent quad each.
  const sun = new THREE.DirectionalLight(0xfff2e0, 2.2);
  sun.position.copy(sunDirection()).multiplyScalar(40);
  scene.add(sun);

  // Ground bounce, at about the strength real ground bounce has. Dropped once
  // the environment map arrives, because then the sky itself is doing this job
  // properly and two ambients is just a washed-out room.
  const bounce = new THREE.HemisphereLight(0xdfe9f5, 0x6b6355, 0.9);
  scene.add(bounce);

  const out = { sun, bounce, texture: null, environment: null, ready: null };

  out.ready = new Promise((resolve) => {
    new RGBELoader()
      // Half float, not full: the sky is 2048x1024, and at full float that is
      // 32 MB of GPU memory for something the eye reads as a gradient. Half is
      // 16 MB and indistinguishable.
      .setDataType(THREE.HalfFloatType)
      .load(SKY_URL, (tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        const pmrem = new THREE.PMREMGenerator(renderer);
        pmrem.compileEquirectangularShader();
        const env = pmrem.fromEquirectangular(tex).texture;
        pmrem.dispose();

        scene.background = tex;
        scene.environment = env;
        out.texture = tex;
        out.environment = env;
        // The sky is now the ambient. Leaving the hemisphere light at full
        // strength on top of it flattens every surface it was added to help.
        bounce.intensity = 0.18;
        sun.intensity = 1.35;
        resolve(out);
      }, undefined, (e) => {
        // A room with a flat sky is still a room. The captain opening this over
        // hotel wifi should get the board, not a stack trace.
        console.warn('the sky did not load:', e);
        resolve(out);
      });
  });

  return out;
}

// Tone mapping, once, on the renderer. ACES is the one that keeps a real sun
// from clipping to a white sheet — and with a genuine HDR in the background
// that is no longer hypothetical: the sun in this image peaks at 72 000.
export function installToneMapping(renderer) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Under 1.0 deliberately. The eye adapts to the brightest thing in the field,
  // so a sky exposed for its own sake is a sky that makes the prose in front of
  // it hard to read — and the whole room is prose in front of it.
  renderer.toneMappingExposure = 0.78;
}
