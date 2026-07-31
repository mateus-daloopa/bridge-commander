// pane3d.js — one live tmux pane, as an object in a room.
//
// A pane has two faces and the whole prototype is an argument about which one
// you are looking at:
//
//   TEXT     — the real terminal. A canvas drawn at the pane's own character
//              grid, mapped 1:1 onto a plane, unlit, unfiltered, no mipmaps.
//              This is the face you can read, and only a couple can be near
//              enough at once to deserve it.
//   AMBIENT  — everything else. It stops pretending to be text and becomes
//              activity: bright and breathing while lines are arriving, dark
//              and still when the worker has stopped. You are meant to feel a
//              stalled agent behind your shoulder before you ever read it.
//
// The frames, the colours and the keystrokes are all the board's existing
// machinery — /pane/stream, ansi.js, /pane/input. Nothing here is a new
// protocol; it is the same pane the drawer shows, given a position in space.

import * as THREE from '../../vendor/three/three.module.min.js';
import { ansiToSegments } from '../ansi.js';

const BG = '#0b0e14';
const FG = '#c8d2e0';
const FONT_PX = 32;                       // canvas pixels — resolution, not size
const FAM = 'ui-monospace, "DejaVu Sans Mono", "Courier New", monospace';
const MIN_COLS = 40, MAX_COLS = 240;
const MIN_ROWS = 8, MAX_ROWS = 60;

// Energy decays over ~6 seconds of silence. Slow enough that a working agent
// looks continuously alive at one frame per second, fast enough that a stall
// is visible before you would have thought to check.
const DECAY_PER_SEC = 0.72;

// Degrees of field of view one character has to occupy before reading it is
// comfortable rather than possible. See fitWidth() for where it comes from.
export const READABLE = 0.42;

function labelTexture(text, color) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = '600 44px ' + FAM;
  const w = Math.max(64, Math.ceil(ctx.measureText(text).width) + 32);
  c.width = w; c.height = 72;
  const g = c.getContext('2d');
  g.font = '600 44px ' + FAM;
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(text, 16, 38);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return { texture: t, aspect: c.width / c.height };
}

export class Pane3d {
  // target: { kind: 'cards'|'lieutenants', id, window?, label, color }
  constructor(target, anisotropy) {
    this.target = target;
    this.energy = 0;
    this.detail = 'ambient';
    this.cols = 80;
    this.rows = 24;
    this.lastFrame = '';
    this.es = null;
    this.status = 'idle';

    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this._sizeCanvas(this.cols, this.rows);

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    // No mipmaps and no minification blur: a terminal that is too small to read
    // should read as "too small", not as grey soup. Anisotropy is what saves
    // the panes you see at an angle, which in a room is most of them.
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.anisotropy = anisotropy || 1;

    this.group = new THREE.Group();
    this.group.userData.pane = this;

    this.textMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }),
    );
    this.ambientMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(target.color || '#4cc2ff'), toneMapped: false }),
    );
    this.ambientMesh.visible = false;

    // A hairline that is always on, whichever face is showing: it is the edge
    // of the object, and without it a dark ambient panel has no silhouette.
    this.frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)),
      new THREE.LineBasicMaterial({ color: new THREE.Color(target.color || '#4cc2ff') }),
    );

    const { texture, aspect } = labelTexture(target.label, target.color || '#9fb0c8');
    this.labelAspect = aspect;
    this.labelMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }),
    );

    this.group.add(this.textMesh, this.ambientMesh, this.frame, this.labelMesh);
    this.setSize(1.6);
    this.draw('connecting…');
  }

  _sizeCanvas(cols, rows) {
    const ctx = this.ctx;
    ctx.font = FONT_PX + 'px ' + FAM;
    this.cw = Math.max(1, ctx.measureText('M').width);
    this.ch = Math.round(FONT_PX * 1.25);
    this.canvas.width = Math.round(cols * this.cw);
    this.canvas.height = rows * this.ch;
    this.cols = cols;
    this.rows = rows;
  }

  // setSize(width) — world width in metres. Height follows the character grid,
  // so a pane never distorts its own text: metres per texel is the same on both
  // axes, which is the whole reason the text stays sharp.
  setSize(width) {
    this.width = width;
    this.height = width * (this.canvas.height / this.canvas.width);
    for (const m of [this.textMesh, this.ambientMesh, this.frame]) m.scale.set(this.width, this.height, 1);
    const lh = Math.max(0.05, this.width * 0.045);
    this.labelMesh.scale.set(lh * this.labelAspect, lh, 1);
    this.labelMesh.position.set(
      -this.width / 2 + (lh * this.labelAspect) / 2,
      this.height / 2 + lh * 0.75,
      0.001,
    );
  }

  // The grid the captain is actually reading, and what it costs him in head
  // turn. degPerChar is the number that decides every layout in the room.
  metrics(distance) {
    const deg = (2 * Math.atan((this.width / 2) / Math.max(0.2, distance))) * 180 / Math.PI;
    return { cols: this.cols, rows: this.rows, deg, degPerChar: deg / this.cols };
  }

  // fitWidth(distance) — how wide this pane would have to BE, in metres, for its
  // characters to be comfortable rather than merely present.
  //
  // A Quest 3 resolves roughly twenty pixels per degree, and a monospace glyph
  // wants eight to ten of them across before reading it stops being work. That
  // is where READABLE comes from, and it is brutal arithmetic: a 240-column tmux
  // window needs about a hundred degrees of the captain's field of view — the
  // whole of it, for one pane. This is the single most important number the
  // prototype produces, so it is a thing you can switch on and stand inside
  // rather than a note in a report.
  fitWidth(distance) {
    return 2 * Math.max(0.2, distance) * Math.tan((this.cols * READABLE * Math.PI / 180) / 2);
  }

  draw(frame) {
    const text = String(frame == null ? '' : frame);
    const plain = text.replace(/\x1b\[[0-9;:]*[@-~]/g, '');
    const lines = plain.split('\n');
    const cols = Math.min(MAX_COLS, Math.max(MIN_COLS, lines.reduce((m, l) => Math.max(m, l.length), 0)));
    const rows = Math.min(MAX_ROWS, Math.max(MIN_ROWS, lines.length));
    if (cols !== this.cols || rows !== this.rows) {
      this._sizeCanvas(cols, rows);
      this.setSize(this.width);            // the plane follows the new grid
      this.texture.dispose();
      this.texture = new THREE.CanvasTexture(this.canvas);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.texture.minFilter = THREE.LinearFilter;
      this.texture.magFilter = THREE.LinearFilter;
      this.texture.generateMipmaps = false;
      this.textMesh.material.map = this.texture;
      this.textMesh.material.needsUpdate = true;
    }

    const ctx = this.ctx;
    const { cw, ch } = this;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.textBaseline = 'alphabetic';

    let col = 0, row = 0;
    for (const seg of ansiToSegments(text)) {
      const pieces = seg.text.split('\n');
      for (let i = 0; i < pieces.length; i++) {
        if (i > 0) { row++; col = 0; }
        if (row >= this.rows) break;
        const t = pieces[i];
        if (!t) continue;
        const x = col * cw;
        const y = row * ch;
        if (seg.bg) { ctx.fillStyle = seg.bg; ctx.fillRect(x, y, t.length * cw, ch); }
        ctx.font = (seg.bold ? 'bold ' : '') + FONT_PX + 'px ' + FAM;
        ctx.fillStyle = seg.fg || FG;
        ctx.globalAlpha = seg.dim ? 0.55 : 1;
        ctx.fillText(t, x, y + Math.round(ch * 0.78));
        ctx.globalAlpha = 1;
        col += t.length;
      }
      if (row >= this.rows) break;
    }
    this.texture.needsUpdate = true;
  }

  setDetail(detail) {
    if (detail === this.detail) return;
    this.detail = detail;
    this.textMesh.visible = detail === 'text';
    this.ambientMesh.visible = detail !== 'text';
  }

  // tick(dt) — the ambient face breathes. Energy is bumped by an arriving frame
  // and decays with nothing but time, so brightness IS recency of output.
  tick(dt) {
    this.energy *= Math.pow(DECAY_PER_SEC, dt);
    if (this.energy < 0.001) this.energy = 0;
    const base = new THREE.Color(this.target.color || '#4cc2ff');
    // The fill stays low: a lieutenant's colour at full strength across a whole
    // panel is a lamp in the room, not a signal, and eight of them is a funfair.
    // The EDGE carries the brightness instead — it reads as activity without
    // lighting the place up, and it keeps the silhouette when the fill is nearly
    // black, which is what a stalled worker is supposed to look like.
    this.ambientMesh.material.color.copy(base.clone().multiplyScalar(0.05 + 0.30 * this.energy));
    this.frame.material.color.copy(base.clone().multiplyScalar(0.30 + 0.70 * this.energy));
    const breathe = 1 + 0.015 * this.energy;
    this.ambientMesh.scale.set(this.width * breathe, this.height * breathe, 1);
  }

  streamUrl() {
    const base = '/api/' + this.target.kind + '/' + encodeURIComponent(this.target.id) + '/pane/';
    const q = this.target.window ? '?window=' + encodeURIComponent(this.target.window) : '';
    return { stream: base + 'stream' + q, input: base + 'input' + q };
  }

  connect() {
    if (this.es) return;
    const { stream } = this.streamUrl();
    const es = new EventSource(stream);
    this.es = es;
    es.addEventListener('frame', (e) => {
      let frame;
      try { frame = JSON.parse(e.data); } catch (err) { return; }
      const s = String(frame);
      if (s !== this.lastFrame) { this.energy = 1; this.lastFrame = s; }
      this.status = 'live';
      this.draw(s);
    });
    const stop = (msg) => { this.status = msg; this.draw(msg); es.close(); this.es = null; };
    es.addEventListener('unsupported', () => stop('this harness has no live pane'));
    es.addEventListener('busy', () => stop('too many live panes — PANE_MAX'));
    es.addEventListener('no-pane', () => stop('no live pane'));
  }

  disconnect() {
    if (!this.es) return;
    this.es.close();
    this.es = null;
    this.status = 'idle';
  }
}
