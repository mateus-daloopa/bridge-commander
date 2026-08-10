// md3d.js — markdown, as things in the room rather than as its own source.
//
// A card body arrived here as one `Text`: the whole markdown source, one size,
// one colour. So `##` was two hash marks, `**bold**` was four asterisks, a
// fenced block was a wall, and eleven lines of anything looked identical. The
// deliverable was the least readable surface in the room.
//
// Neither troika nor uikit ships a rich-text component — this was looked for
// before it was written — so walking tokens and emitting boxes is the normal
// shape of this rather than a workaround. What we walk is **marked's lexer**,
// never its HTML: tokens in, uikit nodes out, and no sanitizer anywhere near
// the room because no string is ever parsed as markup.
//
// Every size is authored in DEGREES at the distance the panel stands, which is
// the only way a size is authored anywhere in this room. Every BLOCK is
// `flexShrink: 0` for the reason in `panel.js` — a scrolling column that
// shrinks its children stacks them on top of each other. The two things that
// do give way are inline and give way in WIDTH, which is a different axis: the
// codespan slab and the weld row, both capped at `maxWidth: '100%'`. And
// everything is inert, because nothing in a card body is a target.
//
// The one place this deliberately refuses to be faithful is the TABLE. The
// panel is 49 characters across. A three-column table in 49 characters is four
// characters a cell, which is less readable than the pipes it replaced — so a
// table comes out as one block per row, each cell a label above its value.

import { lexer } from 'marked';
import * as W from './world.js';
import { Container, Text, COL, cm, fontFor, inert, safe, safeBlock } from './kit.js';

// The type ladder. Body is the panel's own prose size; headings step UP from it
// and stop at `TYPE.head`, which is what the panel's own title is set at —
// nothing inside a body outranks the thing it is the body of.
const HEAD = [W.TYPE.head, 1.75, 1.55, W.TYPE.body, W.TYPE.body, W.TYPE.body];

// Emphasis has one axis here and it is weight: the sheet has four weights of
// Inter and not one italic face, so `*this*` gets semi-bold and `**this**` gets
// bold. Two steps of the same ladder beats faking a slant the font cannot draw.
const EM = 'semi-bold';
const STRONG = 'bold';

// A fragment that OPENS with one of these belongs to the word in front of it —
// `seq`. is one thing and `seq` . is two. The double quote is deliberately not
// here: after an inline mark it almost always opens a phrase, and the fold
// table collapses the curly quotes into the straight one, so nothing here
// could tell an opening quote from a closing one anyway.
const CLOSERS = '.,;:!?)]}\'';

export function addMarkdown(panel, source) {
  const md = new Md(panel.spec.distM);
  // The guard covers the WALK, not only the lexer. `paint()` stamps itself
  // before it builds, so a throw halfway through leaves the card empty AND
  // every later refresh early-returning on the matching stamp — a card that
  // never comes back until it is edited. Degrading to the raw source is worse
  // prose and an infinitely better failure.
  let nodes;
  try {
    nodes = md.blocks(tokens(source), 0, COL.text);
  } catch {
    nodes = [md.text(source, { block: true })];
  }
  for (const node of nodes) panel.addBlock(node);
  return panel;
}

// A card body is whatever he typed, and this runs inside the frame loop — so a
// lexer that throws comes back as one paragraph of the raw source rather than
// as a room that stopped drawing.
function tokens(source) {
  try {
    return lexer(String(source == null ? '' : source));
  } catch {
    return [{ type: 'paragraph', text: String(source == null ? '' : source), tokens: null }];
  }
}

class Md {
  constructor(distM) {
    this.distM = distM;
    // The panel's own padding unit — 1° at the distance it stands. Indents,
    // gaps and the slab's inner padding are all multiples of it, so the whole
    // body keeps one rhythm however deep a list goes.
    this.pad = W.sizeForArc(1.0, distM);
  }

  size(deg) { return fontFor(deg, this.distM); }

  // `block` is for text whose shape is the content. Both halves of it are
  // needed and neither is obvious: `safeBlock` keeps the line breaks the
  // filter would otherwise eat, and `whiteSpace: 'pre'` stops uikit collapsing
  // them again — its default really is `normal`, and normal means collapse.
  text(str, { deg = W.TYPE.body, color = COL.text, weight = undefined, block = false, breakAll = false } = {}) {
    const t = new Text({
      text: block ? safeBlock(str) : safe(str),
      fontSize: this.size(deg), color, flexShrink: 0,
      ...(block ? { whiteSpace: 'pre' } : null),
      ...(breakAll ? { wordBreak: 'break-all' } : null),
      ...(weight ? { fontWeight: weight } : null),
    });
    return inert(t);
  }

  column(properties, children) {
    const c = new Container({ flexDirection: 'column', flexShrink: 0, ...properties });
    for (const k of children) if (k) c.add(k);
    return inert(c);
  }

  // ---- blocks --------------------------------------------------------------

  blocks(list, depth, color) {
    const out = [];
    for (const t of list || []) {
      const n = this.block(t, depth, color);
      if (Array.isArray(n)) out.push(...n);
      else if (n) out.push(n);
    }
    return out;
  }

  block(t, depth, color) {
    switch (t.type) {
      case 'space': return null;

      case 'heading': {
        const deg = HEAD[Math.min(Math.max(t.depth, 1), 6) - 1];
        return this.column(
          { marginTop: cm(this.pad * (depth ? 0.4 : 0.9)) },
          [this.runs(t.tokens, { deg, color, weight: 'semi-bold' })],
        );
      }

      case 'paragraph':
      case 'text':
        // A loose list item hands back a `text` block with no tokens on it.
        return this.runs(t.tokens, { color }) || (t.text ? this.text(t.text, { color }) : null);

      case 'code':
        return this.slab(t.text, { block: true, lang: t.lang });

      case 'blockquote':
        // An indent and a dimmer ink say "somebody else said this"; the rule
        // down the left edge is what says it at a glance, from across the room.
        return this.column({
          marginLeft: cm(this.pad * 0.6),
          paddingLeft: cm(this.pad * 0.7),
          gap: cm(this.pad * 0.4),
          borderLeftWidth: cm(0.0018), borderColor: COL.faint, borderOpacity: 0.8,
        }, this.blocks(t.tokens, depth, COL.dim));

      case 'list': {
        let n = Number(t.start || 1);
        return this.column(
          { gap: cm(this.pad * 0.35), marginLeft: cm(depth ? this.pad * 1.1 : 0) },
          (t.items || []).map((item) => this.item(item, t.ordered ? `${n++}.` : '-', depth, color)),
        );
      }

      case 'hr':
        return this.column({
          height: cm(0.001), marginY: cm(this.pad * 0.5),
          backgroundColor: COL.rim, backgroundOpacity: 0.55,
        }, []);

      case 'table':
        return this.table(t, color);

      case 'html':
        // Raw HTML in a card body is a string he typed, not markup to run —
        // it goes on the wall as the source it is.
        return this.slab(t.raw, { block: true });

      default:
        return t.text ? this.runs(t.tokens, { color }) || this.text(t.text, { color }) : null;
    }
  }

  // The bullet in one cell and the item's own blocks in a column beside it —
  // which is what makes the second line of a wrapped item start under the TEXT
  // rather than under the bullet, and a list read as a list rather than as
  // paragraphs with dashes in front of them.
  item(item, bullet, depth, color) {
    const inner = item.tokens && item.tokens.length
      ? this.blocks(item.tokens, depth + 1, color)
      : [this.text(item.text || '', { color })];
    const mark = item.task ? (item.checked ? '[x]' : '[ ]') : bullet;
    const row = new Container({
      flexDirection: 'row', flexShrink: 0, alignItems: 'flex-start',
      gap: cm(this.pad * 0.45),
    });
    row.add(this.text(mark, { color: COL.faint }));
    row.add(this.column({ flexGrow: 1, flexShrink: 1, gap: cm(this.pad * 0.3) }, inner));
    return inert(row);
  }

  // A fenced block, and the same box does duty for an inline `codespan` — the
  // tint is what says "this is literal" in both places.
  //
  // The inline one is the exception to `flexShrink: 0`, and it has to be: a
  // backticked path is routinely longer than the panel is wide, and a rigid
  // box holding an unbreakable word walks straight off the edge and gets
  // clipped. It gives way in WIDTH inside a wrapping row — which is a
  // different axis from the height a scroll column would steal — and breaks
  // mid-word rather than overflowing. The fence keeps its rigid box.
  slab(code, { block = false, lang = '' } = {}) {
    const box = new Container({
      flexDirection: 'column',
      ...(block ? { flexShrink: 0 } : { flexShrink: 1, maxWidth: '100%' }),
      paddingX: cm(this.pad * 0.55), paddingY: cm(this.pad * (block ? 0.5 : 0.15)),
      borderRadius: cm(0.005),
      backgroundColor: COL.slab, backgroundOpacity: 1,
    });
    if (block && lang) box.add(this.text(lang, { deg: W.TYPE.meta, color: COL.faint }));
    box.add(this.text(code, {
      deg: block ? W.TYPE.meta : W.TYPE.body, color: COL.text, block,
      ...(block ? null : { breakAll: true }),
    }));
    return inert(box);
  }

  // ---- a paragraph, as runs ------------------------------------------------
  //
  // Bold or code inside a sentence means the sentence stops being one `Text`
  // and becomes a wrapping row of them — and a `Text` only ever wraps at its
  // OWN edges, so a row of three runs is three lines: `Estado:` alone, then the
  // sentence, then the rest. That is not a paragraph, it is a stack.
  //
  // So a mixed paragraph is broken all the way down to WORDS, and the row wraps
  // between them like a line of prose does. The space between words is the
  // row's own column gap rather than a character, because a leading space
  // inside a `Text` is not one — `safe` trims it.
  //
  // It is not free: a mixed paragraph costs one layout node a word. A paragraph
  // with no inline marks at all stays a single `Text` and pays none of it,
  // which is most of them.
  runs(list, { deg = W.TYPE.body, color = COL.text, weight = undefined } = {}) {
    const flat = [];
    this.flatten(list, { deg, color, weight }, flat);
    if (!flat.length) return null;
    if (flat.length === 1 && flat[0].kind === 'text') {
      return this.text(flat[0].str, flat[0].style);
    }
    const row = new Container({
      flexDirection: 'row', flexWrap: 'wrap', flexShrink: 0, alignItems: 'flex-end',
      gapColumn: this.size(deg) * 0.27, gapRow: this.size(deg) * 0.18,
    });
    // Build the cells first, because the word that closes a phrase has to be
    // welded to the one before it — the row's gap sits between every child,
    // and a gap between `seq` and its full stop reads as `seq .`.
    const cells = [];
    for (const r of flat) {
      if (r.kind === 'break') { cells.push({ node: this.column({ width: '100%', height: 0 }, []) }); continue; }
      if (r.kind === 'code') { cells.push({ node: this.slab(r.str) }); continue; }
      const led = /^\s/.test(String(r.str));
      const words = String(r.str).split(/\s+/).filter(Boolean);
      words.forEach((w, i) => cells.push({
        node: this.text(w, r.style),
        glue: i === 0 && !led && CLOSERS.includes(w[0]),
      }));
    }
    const out = [];
    for (const c of cells) {
      if (c.glue && out.length) out.push(this.glued(out.pop(), c.node));
      else out.push(c.node);
    }
    for (const n of out) row.add(n);
    return inert(row);
  }

  // Two cells that must read as one word. No gap between them, and it gives
  // way in width for the same reason the inline slab does.
  glued(a, b) {
    const g = new Container({
      flexDirection: 'row', alignItems: 'flex-end',
      gap: 0, flexShrink: 1, maxWidth: '100%',
    });
    g.add(a); g.add(b);
    return inert(g);
  }

  flatten(list, style, out) {
    for (const t of list || []) {
      switch (t.type) {
        case 'strong': this.flatten(t.tokens, { ...style, weight: STRONG }, out); break;
        case 'em': this.flatten(t.tokens, { ...style, weight: style.weight || EM }, out); break;
        case 'del': this.flatten(t.tokens, { ...style, color: COL.dim }, out); break;
        case 'codespan': out.push({ kind: 'code', str: t.text }); break;
        case 'br': out.push({ kind: 'break' }); break;
        case 'link':
          // Nothing in a body is a target, so a link cannot be one. It gets its
          // text and then its address, which is the whole of what a link is
          // when you cannot press it.
          this.flatten(t.tokens, style, out);
          if (t.href && t.href !== t.text) out.push({ kind: 'text', str: t.href, style: { ...style, deg: W.TYPE.meta, color: COL.faint, weight: undefined } });
          break;
        case 'image':
          out.push({ kind: 'text', str: (t.text || 'image') + ' ' + (t.href || ''), style: { ...style, color: COL.faint } });
          break;
        default:
          if (t.tokens && t.tokens.length) this.flatten(t.tokens, style, out);
          else if (t.text || t.raw) out.push({ kind: 'text', str: t.text || t.raw, style });
      }
    }
  }

  // ---- a table, unrolled ---------------------------------------------------
  //
  // One block per ROW, each cell a dim label above its value. Forty-nine
  // characters cannot hold a grid, and a grid squeezed into them is less
  // readable than the pipes and dashes it was meant to replace.
  table(t, color) {
    const heads = (t.header || []).map((h) => safe(h.text || ''));
    const rows = (t.rows || []).map((cells) => this.column({
      gap: cm(this.pad * 0.2),
      paddingY: cm(this.pad * 0.3),
      borderTopWidth: cm(0.0012), borderColor: COL.rim, borderOpacity: 0.35,
    }, cells.flatMap((cell, i) => [
      heads[i] ? this.text(heads[i], { deg: W.TYPE.meta, color: COL.faint }) : null,
      this.runs(cell.tokens, { color }) || this.text(cell.text || '', { color }),
    ])));
    return this.column({ gap: 0 }, rows);
  }
}
