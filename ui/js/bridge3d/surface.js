// surface.js — a panel in the room: a canvas, drawn by us, on a plane you can
// take hold of.
//
// Inside an immersive session the browser stops drawing HTML, so nothing the
// board already has — the kanban, the chat, a card — comes across. Every
// surface in the room has to be painted here. This is the paint kit: a canvas
// sized in world metres, a small stack of text and box primitives, and the
// grab / move / resize / close that makes it a window rather than a picture.
//
// It knows nothing about cards or lieutenants. What goes ON a surface is the
// business of whoever made it.

import * as THREE from '../../vendor/three/three.module.min.js';

export const FONT = 'ui-monospace, "DejaVu Sans Mono", "Courier New", monospace';
export const UI = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// Canvas pixels per world metre. Everything else is expressed in metres and
// multiplied by this, so a surface is authored once and stays sharp when the
// captain grows it — the canvas is re-cut, not stretched.
export const PPM = 1100;

export const COL = {
  bg: '#0d1117',
  bgUp: '#141b24',        // the panel standing in the front
  edge: '#1f2b3a',
  text: '#c8d2e0',
  dim: '#7d8ea6',
  faint: '#4a5a70',
  accent: '#4cc2ff',
  warn: '#f0a45a',
  good: '#4ad07a',
};

// wrap(ctx, text, maxWidth) -> lines. Measured, not guessed: a card title is
// prose and a monospace estimate is wrong often enough to look broken.
export function wrap(ctx, text, maxWidth) {
  const out = [];
  for (const para of String(text == null ? '' : text).split('\n')) {
    if (!para) { out.push(''); continue; }
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const next = line + word;
      if (line && ctx.measureText(next).width > maxWidth) { out.push(line.trimEnd()); line = word.trimStart(); }
      else line = next;
    }
    out.push(line.trimEnd());
  }
  return out;
}

export class Surface {
  // widthM / heightM are world metres; the canvas follows at PPM.
  constructor({ widthM = 1.0, heightM = 0.7, title = '', closable = true } = {}) {
    this.widthM = widthM;
    this.heightM = heightM;
    this.title = title;
    this.closable = closable;
    this.front = false;
    this.dirty = true;

    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this._cut();

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;

    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }),
    );
    this.mesh.userData.surface = this;

    this.frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)),
      new THREE.LineBasicMaterial({ color: new THREE.Color(COL.edge) }),
    );

    this.group = new THREE.Group();
    this.group.add(this.mesh, this.frame);
    this.group.userData.surface = this;
    this._applySize();
  }

  _cut() {
    this.canvas.width = Math.max(64, Math.round(this.widthM * PPM));
    this.canvas.height = Math.max(64, Math.round(this.heightM * PPM));
  }

  _applySize() {
    this.mesh.scale.set(this.widthM, this.heightM, 1);
    this.frame.scale.set(this.widthM, this.heightM, 1);
  }

  // resize(w, h) — re-cut the canvas rather than stretching the plane, so text
  // is the same sharpness at every size the captain drags it to.
  resize(widthM, heightM) {
    this.widthM = Math.max(0.25, Math.min(4, widthM));
    this.heightM = Math.max(0.2, Math.min(3, heightM));
    this._cut();
    this._applySize();
    this.texture.dispose();
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.mesh.material.map = this.texture;
    this.mesh.material.needsUpdate = true;
    this.dirty = true;
  }

  // Depth is the only thing that says which panel is being worked and which is
  // merely available: the front one is brighter and nearer, the rest fall back
  // and go quiet. No panel is ever moved behind the captain — swapping has to
  // cost a button press, never a neck movement.
  setFront(on) {
    if (on === this.front) return;
    this.front = on;
    this.frame.material.color.set(on ? COL.accent : COL.edge);
    this.mesh.material.color.setScalar(on ? 1 : 0.55);
    this.dirty = true;
  }

  // ---- painting ----------------------------------------------------------
  // Coordinates given to these are CANVAS pixels; helpers below take metres
  // where that reads better.

  begin() {
    const g = this.ctx;
    g.fillStyle = this.front ? COL.bgUp : COL.bg;
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    g.textBaseline = 'alphabetic';
    this.hits = [];
    return g;
  }

  // A rectangle on the canvas that means something when it is pointed at. The
  // panel declares these AS it paints, so what is clickable is whatever is
  // actually drawn — the two cannot drift apart.
  region(x, y, w, h, action) { this.hits.push({ x, y, w, h, action }); }

  // uv comes off the raycast with its origin at the bottom left, which is why y
  // is flipped exactly here and nowhere else in the room.
  hitTest(uv) {
    const x = uv.x * this.canvas.width;
    const y = (1 - uv.y) * this.canvas.height;
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const r = this.hits[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.action;
    }
    return null;
  }

  end() { this.texture.needsUpdate = true; this.dirty = false; }

  // A titled panel's chrome: the bar across the top, and the close mark the
  // controller ray can hit. Returns the y the content starts at.
  chrome(g, subtitle) {
    const w = this.canvas.width;
    const barH = 54;
    g.fillStyle = this.front ? '#1b2531' : '#131a23';
    g.fillRect(0, 0, w, barH);
    g.fillStyle = this.front ? COL.accent : COL.dim;
    g.font = '600 26px ' + UI;
    g.fillText(this.title, 20, 36);
    // Measure the title in the TITLE's font, before switching to the smaller
    // one — measuring it in the subtitle's font puts the subtitle on top of it.
    const after = 20 + g.measureText(this.title).width + 16;
    if (subtitle) {
      g.fillStyle = COL.faint;
      g.font = '22px ' + UI;
      g.fillText(subtitle, after, 36);
    }
    if (this.closable) {
      g.strokeStyle = COL.faint;
      g.lineWidth = 3;
      const cx = w - 30, cy = barH / 2, r = 9;
      g.beginPath();
      g.moveTo(cx - r, cy - r); g.lineTo(cx + r, cy + r);
      g.moveTo(cx + r, cy - r); g.lineTo(cx - r, cy + r);
      g.stroke();
      this.region(w - 62, 0, 62, barH, { kind: 'close' });
    }
    // The bar itself is the handle: point anywhere along it and squeeze to move
    // the window, which is the one gesture every window manager already taught
    // everybody.
    this.region(0, 0, w - 64, barH, { kind: 'grab' });
    return barH;
  }

  dispose() {
    this.texture.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.frame.geometry.dispose();
    this.frame.material.dispose();
  }
}
