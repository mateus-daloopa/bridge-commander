# The room's environment

The sky the bridge is lit by, and the materials it is built out of. All **CC0** —
public-domain dedication, no attribution required — which is the only licence
that can ship in a public repo without attribution theatre. The authors are
credited here anyway, because they did the work.

This directory is the same population as `ui/vendor/`: fetched once, never
edited in place, replaced by changing the table below. `server.js` serves both
with a one-year immutable cache — a 5.4 MB sky re-downloaded on every open, over
a headset's wifi, is the difference between a room that appears and one he gives
up waiting for.

## What is here

| file | source | author | licence |
|---|---|---|---|
| `sky.hdr` | [Kloofendal 48d Partly Cloudy (Pure Sky)](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) | Greg Zaal, Jarod Guest | CC0 |
| `deck-*.webp` | [Concrete031](https://ambientcg.com/view?id=Concrete031) | ambientCG | CC0 |
| `wall-*.webp` | [Concrete034](https://ambientcg.com/view?id=Concrete034) | ambientCG | CC0 |
| `plant/` | [Potted Plant 02](https://polyhaven.com/a/potted_plant_02) | Rico Cilliers | CC0 |

## How they were prepared

**`sky.hdr`** — the 2k `.hdr` exactly as Poly Haven serves it, 5.4 MB:

    curl -L -o ui/env/sky.hdr \
      https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloofendal_48d_partly_cloudy_puresky_2k.hdr

2k, not 4k: 4k is 20.7 MB for a background the eye reads as gradients and soft
cloud edges. Not 1k either — 1k is 1.4 MB and visibly soft as a *background*,
even though it would be plenty as a light source. One file doing both jobs at 2k
is the honest middle, and it is loaded as `HalfFloatType` so it costs 16 MB of
GPU memory rather than 32.

A sharper option exists if it is ever wanted: keep a 1k HDR for the lighting and
add a downscaled WebP of Poly Haven's tonemapped JPG as the background. That is
two files and a conversion step for a sharpness nobody has asked for yet.

**The `*.webp` sets** — from the ambientCG `1K-JPG` zips, re-encoded. The zips
are 3.7–9.2 MB each and carry displacement maps, a `.blend`, a `.usdc` and a
`.mtlx` we have no use for. What ships is three files per material at 1024²:

- `-color.webp` — quality 84, sRGB
- `-normal.webp` — quality 90, linear. **The normal map is why this is worth
  downloading at all**: it does more for how a surface reads than any amount of
  extra geometry. The deck is still one flat circle.
- `-orm.webp` — quality 85, linear. Ambient occlusion, roughness and metalness
  packed into R, G and B, which is the glTF convention. three reads the channel
  it wants out of each slot, so one image feeds `aoMap`, `roughnessMap` and
  `metalnessMap` for a single texture fetch instead of three.

    # per material, from <Name>_1K-JPG.zip
    Color.jpg            -> <name>-color.webp    1024², q84, sRGB
    NormalGL.jpg         -> <name>-normal.webp   1024², q90, linear
    AmbientOcclusion.jpg -> R  \
    Roughness.jpg        -> G   } -> <name>-orm.webp  1024², q85, linear
    (constant 0)         -> B  /

NormalGL, not NormalDX: three.js expects OpenGL-convention normals, and the DX
one is the same map with its green channel inverted — which looks like the
lighting is subtly wrong rather than like a bug.

**`plant/`** — the 1k glTF from Poly Haven, with its six JPEG textures re-encoded
to WebP at 1024² and the `images[].uri` entries in the `.gltf` rewritten to
match. Diffuse at quality 82, normal and roughness at 90, because a compression
artefact in a normal map is a dent in the surface. The `.bin` is copied
unchanged and is 1.85 MB of the 2.39 — geometry, not texture, and the only thing
here that would benefit from Draco or meshopt if the prop count ever grows.

Loaded once and cloned, so the plants share geometry and materials.

**Four of them, not six, and that is a frame-budget decision.** Poly Haven's
"1k" names the *texture* resolution — the geometry is full quality, and this
plant is about 68 000 triangles. Six took the room from 45 000 triangles to
452 000, and a headset submits that twice, once per eye, inside an 11 ms frame.
Four holds it near 312 000.

The right fix is decimation: `gltfpack` or meshopt would take this to a few
thousand triangles with no visible difference at four metres, and would shrink
the 1.85 MB `.bin` along with it. That needs a tool this repo does not have yet,
so until then the count is the lever — and saying so beats shipping a prettier
room that drops frames.

## The download budget

**Ceiling: 12 MB for the whole environment.** He opens this over wifi, on a
headset, and one good environment beats a set-dressed scene that takes a minute
to appear.

| | |
|---|---|
| `sky.hdr` | 5.45 MB |
| deck (3 files) | 0.50 MB |
| wall (3 files) | 0.26 MB |
| plant (gltf + bin + 6 textures) | 2.39 MB |
| **total** | **8.60 MB** |

Everything here is fetched after the first frame — the room paints, and the sky
and the materials arrive into a room that is already standing. A failed fetch
leaves a flat sky and untextured surfaces rather than a stack trace, because a
captain on bad wifi should still get his board.

## Choosing a deck texture, and why this one

The first attempt used `PavingStones131` — mossy cobbles, and lovely head-on. At
a grazing angle it broke into metre-wide yellow and olive bands across the whole
lower field. Replacing the material with a plain colour made the bands vanish,
which is how I know it was the texture and not the geometry: the sampler is
picking a high mip level, that mip is the average of whole tiles, and a texture
with strong **large-scale colour variation** has something to band into.

A terrace is mostly seen at a grazing angle, so a uniform surface is not a
matter of taste here. `Concrete031` has panel joints and no large-scale colour
drift, and it is what the reference — Meta's Horizon Central — actually uses
underfoot.
