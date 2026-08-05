// board.js — every card, findable, and the card you found.
//
// Two surfaces, and the split between them is the one the whole room is built
// around: **what you HUNT for and what you READ are not the same thing.**
//
// The BOARD is hunting. Ten rows, each one a target the size of a target, each
// carrying a title you can read at a glance and a colour that says whose it is.
// You are scanning it, not dwelling in it, so it is wide and shallow and one
// press deep.
//
// The CARD is reading. It is the hand panel — near, narrow, prose-shaped — and
// it carries the body, which is the deliverable, plus the thread, which is how
// you answer it. He asked for the card and its chat together, and this is that,
// stacked rather than side by side: two 34° panels side by side is 68° of the
// 90° a comfortable field has, and the second one would be at the edge where a
// flat panel turned to face the eye stops facing it.
//
// The board's filter is one field and it matches everything — title, id, owner,
// column, label. Typing a lieutenant's name IS filtering by lieutenant, which
// is why there is no second control for it.

import * as W from './world.js';
import { Container, Text, Input, Image, COL, cm, fontFor, inert, safe } from './kit.js';
import { avatarTexture } from './avatars3d.js';
import { Panel } from './panel.js';
import { ChatPanel } from './chat.js';
import { Target } from './hover.js';

const D = W.BOARD.distM;
const ROWS = W.boardRows();
const SEATS = ROWS * W.BOARD.cols;

export class BoardPanel extends Panel {
  constructor({ onCard, onClose }) {
    super({ name: 'board', title: 'the board', subtitle: '', spec: W.BOARD, tint: COL.accent, onClose });
    this.onCard = onCard;
    // Dead ahead. The board is the surface he turns to, so it has a place
    // rather than a slot — though once he picks it up, it is his.
    this.homeAz = 0;
    this.query = '';
    this.doc = { cards: [] };

    const pad = W.sizeForArc(1.0, D);
    const barM = W.sizeForArc(W.BUILD.hit, D);

    // The rows live in a wrapping row rather than a column, which is what makes
    // two columns of five out of one flex container.
    this.grid = new Container({
      flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start',
      flexGrow: 1, overflow: 'scroll',
      scrollbarWidth: cm(W.sizeForArc(0.4, D)), scrollbarColor: COL.faint, scrollbarOpacity: 0.45,
    });
    this.body.setProperties({ padding: cm(pad * 0.5), gap: 0 });
    this.body.add(this.grid);
    this._kids.push(this.grid);

    this.seats = [];
    for (let i = 0; i < SEATS; i++) this.seats.push(this._seat());

    // ---- the filter --------------------------------------------------------
    this.field = new Input({
      flexGrow: 1, height: cm(barM),
      backgroundColor: COL.field, backgroundOpacity: 1, borderRadius: cm(0.010),
      borderWidth: cm(0.0018), borderColor: COL.faint, borderOpacity: 0.6,
      paddingX: cm(pad * 0.7), verticalAlign: 'center',
      fontSize: fontFor(W.TYPE.body, D), color: COL.text, caretColor: COL.accent,
      placeholder: 'filter - a word, a lieutenant, a column',
      hover: { borderColor: COL.accent, borderOpacity: 1 },
      onValueChange: (v) => { this.query = v || ''; this.repaint(); },
    });
    this.count = new Text({
      text: '', fontSize: fontFor(W.TYPE.meta, D), color: COL.faint,
      flexShrink: 0, wordBreak: 'keep-all',
    });
    inert(this.count);
    this.foot.add(this.field, this.count);
    this.foot.setProperties({ display: 'flex' });

    const fieldTarget = new Target({
      mesh: this.field, name: 'board-filter',
      onSelect: () => { if (this.field.element) this.field.element.focus(); },
    });
    fieldTarget._paint = () => {};
    this.targets.push(fieldTarget);
  }

  // One row: a colour bar for the owner, a title, and the column it is in.
  // The whole row is the target — a press anywhere on it opens the card, which
  // is the only sane rule when the mark is 27° wide and the ray scatters.
  _seat() {
    const rowH = W.sizeForArc(W.BUILD.hit, D);
    const gap = W.sizeForArc(W.BUILD.gap, D);
    const box = new Container({
      width: (100 / W.BOARD.cols) + '%', height: cm(rowH + gap),
      paddingX: cm(gap * 0.5), paddingY: cm(gap * 0.5),
      flexShrink: 0, display: 'none',
    });
    // A row is a target, so its region has to be VISIBLE — and in a dark scheme
    // its fill cannot do that job. Measured on the rendered frame, a row plate
    // came out 1.03:1 against the panel behind it, and no pair of dark fills can
    // do better: the +0.05 term in the contrast formula dominates down there, so
    // 3:1 between two dark plates is arithmetically out of reach. Worse, a plate
    // light enough to clear 3:1 is a plate its own text cannot clear 4.5:1 on.
    //
    // So the shape is carried by the RIM, which is bright and thin — 5.8:1
    // against the panel, and it costs no legibility because no text sits on it.
    const inner = new Container({
      flexGrow: 1, flexDirection: 'row', alignItems: 'center',
      gap: cm(W.sizeForArc(0.7, D)), paddingX: cm(W.sizeForArc(0.8, D)),
      borderRadius: cm(0.008),
      borderWidth: cm(0.004), borderColor: COL.rim, borderOpacity: 1,
      backgroundColor: COL.slot, backgroundOpacity: 1,
      hover: { backgroundColor: COL.barLit, borderColor: COL.accent },
      active: { backgroundColor: '#2a5f7a', borderColor: COL.accent },
    });
    const chip = new Container({
      width: cm(W.sizeForArc(0.9, D)), height: '64%', flexShrink: 0,
      borderRadius: cm(0.003), backgroundColor: COL.faint,
    });
    // The owner's face in the row itself. A glance down the board should say
    // whose each card is without reading a word — which is the whole reason the
    // owner was allowed to stop being a position on the deck.
    const face = new Image({
      width: cm(W.sizeForArc(3.4, D)), height: cm(W.sizeForArc(3.4, D)),
      flexShrink: 0, borderRadius: cm(0.005), display: 'none', objectFit: 'fill',
      borderWidth: cm(0.0012), borderColor: COL.rim, borderOpacity: 0.8,
    });
    const title = new Text({
      text: '', flexGrow: 1, flexShrink: 1, flexBasis: 0, overflow: 'hidden',
      fontSize: fontFor(W.TYPE.meta, D), color: COL.text, wordBreak: 'keep-all',
    });
    const where = new Text({
      text: '', flexShrink: 0, textAlign: 'right',
      fontSize: fontFor(W.TYPE.meta, D), color: COL.faint, wordBreak: 'keep-all',
    });
    inert(chip); inert(face); inert(title); inert(where);
    inner.add(chip, face, title, where);
    box.add(inner);
    this.grid.add(box);

    const seat = { box, inner, chip, face, title, where, card: null };
    const t = new Target({
      mesh: inner, name: 'board-row',
      onSelect: () => { if (seat.card && this.onCard) this.onCard(seat.card); },
    });
    t._paint = () => {};
    this.targets.push(t);
    return seat;
  }

  paint(doc) { this.doc = doc || { cards: [] }; if (this.open) this.repaint(); }

  repaint() {
    const q = this.query.trim().toLowerCase();
    const lts = new Map((this.doc.lieutenants || []).map((l) => [l.id, l]));
    const cols = new Map((this.doc.columns || []).map((c) => [c.id, c.title || c.id]));
    const all = this.doc.cards || [];
    const hit = (c) => {
      if (!q) return true;
      const lt = lts.get(c.owner);
      return [c.title, c.id, c.column, cols.get(c.column), c.owner, lt && lt.name, (c.labels || []).join(' ')]
        .some((s) => String(s || '').toLowerCase().includes(q));
    };
    // Newest activity first. The board's own order is arbitrary here — this is
    // the finding surface, and the thing he is looking for is nearly always
    // something that moved recently.
    const cards = all.filter(hit).slice().sort((a, b) => String(b.activity || b.updated || '')
      .localeCompare(String(a.activity || a.updated || '')));

    this.count.setProperties({ text: safe(q ? cards.length + ' of ' + all.length : all.length + ' cards') });
    this.setTitle('the board', q ? 'filtered' : 'newest first');

    this.seats.forEach((s, i) => {
      const c = cards[i];
      s.card = c || null;
      s.box.setProperties({ display: c ? 'flex' : 'none' });
      if (!c) return;
      const lt = lts.get(c.owner);
      s.chip.setProperties({ backgroundColor: W.agentColour(lt && lt.color) });
      const tex = avatarTexture(lt && lt.avatar);
      s.face.setProperties(tex ? { src: tex, display: 'flex' } : { display: 'none' });
      s.title.setProperties({ text: safe(c.title || c.id) });
      s.where.setProperties({ text: safe(shortColumn(cols.get(c.column) || c.column)) });
    });
    // Saying it out loud rather than silently showing the first ten: a surface
    // that truncates without admitting it reads as "this is everything".
    this._more = Math.max(0, cards.length - SEATS);
    if (this._more) {
      this.count.setProperties({ text: safe(cards.length + ' - ' + this._more + ' more, filter to see them') });
    }
  }

  setOpen(on) {
    super.setOpen(on);
    if (on) this.repaint();
  }
}

// ---- the card ---------------------------------------------------------------

// The card body AND its thread on one surface, because they are one thing: the
// body is what the work IS and the thread is how he changes it. It is a
// ChatPanel because the composer, the sending and the tail-painting are all
// identical — the only difference is that a card's prose sits above its
// conversation.
export class CardPanel extends ChatPanel {
  constructor({ card, tint, onClose }) {
    super({ target: 'card:' + card.id, title: card.title || card.id, subtitle: '', tint, onClose });
    this.card = card;
  }

  paintCard(card, lt, columnTitle) {
    this.setFace(lt && lt.avatar);
    // A card he has just opened starts at the TOP: the body is the deliverable
    // and he came to read it from the beginning. A chat starts at the bottom
    // because the newest line is the point of it. Same panel, opposite ends,
    // and only on the first paint — after that the scroll is his.
    if (this.card !== card || !this._seen) { this._toTop = 3; this._seen = true; }
    this.card = card;
    this.setTitle(card.title || card.id, [columnTitle, lt && (lt.name || lt.id), card.type].filter(Boolean).join('  -  '));
    this._lastPainted = '';       // the body changed, so the tail has to repaint
    this.paint(card.thread);
  }

  // The card's own prose goes in first, then the conversation under it. Both
  // land in the same scrolling body, so reading a long card and then reading
  // what was said about it is one gesture rather than two surfaces.
  paint(messages) {
    const list = (messages || []).slice(-12);
    const stamp = (this.card ? this.card.id + ':' + (this.card.updated || '') : '')
      + '|' + list.length + '|' + (list.length ? list[list.length - 1].ts : '');
    if (stamp === this._lastPainted) return;
    this._lastPainted = stamp;

    this.clearBody();
    const c = this.card || {};
    if (c.id) this.addText(c.id, { size: W.TYPE.meta, color: COL.faint });
    const prs = ((c.attributes && c.attributes.prs) || []).map((p) => p.state).join(', ');
    if (prs) this.addText('pr: ' + prs, { size: W.TYPE.meta, color: COL.dim });
    this.addText(c.body || 'no body yet', {});
    if (list.length) {
      this.addText('- the thread -', { size: W.TYPE.meta, color: COL.faint });
      for (const m of list) {
        const mine = m.author === 'user';
        this.addText((mine ? 'you' : (m.author || 'lieutenant')), { size: W.TYPE.meta, color: COL.faint });
        this.addText(m.text || '', { color: mine ? COL.dim : COL.text });
      }
    }
    if (!this._toTop) this.scrollToEnd();
  }

  tick(now) {
    super.tick(now);
    if (!this._toTop) return;
    if (this.body.maxScrollPosition && this.body.maxScrollPosition.value) {
      this.body.scrollPosition.value = [0, 0];
      this._toTop--;
    }
  }
}

// "Your review" is the useful half of "👀 Your review", and the emoji is not in
// the font's 104-glyph atlas anyway.
function shortColumn(title) {
  return String(title || '').replace(/^[^\w]+/, '').trim();
}
