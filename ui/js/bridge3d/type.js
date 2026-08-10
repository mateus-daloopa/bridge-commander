// type.js — what the font can actually draw, and what to do about the rest.
//
// It is here rather than in `kit.js` for the same reason `world.js` is its own
// file: no imports, so a test can actually LOAD it. kit.js reaches three.js and
// uikit through the page's import map and node has no business resolving that,
// which left the filter deciding which letters survive checkable only by
// regex over its own source. It comes back out of `kit.js`, so nothing else
// has to know it moved.
//
// An MSDF font is an atlas, not an outline library: the sheet carries exactly
// the glyphs below and nothing else. A character outside it is not a fallback,
// it is a hole in the sentence plus a console warning per frame — and the
// board's own column titles start with an emoji, so this is not hypothetical.
// Every string the room paints goes through `safe` first.
//
// The upstream `@pmndrs/msdfonts` sheet held 104 glyphs: ASCII plus a little
// German. It could not spell `França`, and because `safe` deletes what the
// sheet cannot draw, it did not fail — it quietly returned `Frana`. The sheet
// under `ui/vendor/msdfonts/inter-latin1.js` is generated here from Inter 4.1
// over ASCII plus the whole Latin-1 letter range, so Portuguese, French,
// Spanish and the Nordic languages come back whole.
//
// The list is checked against the vendored sheet by a test, so a font swap that
// changes the coverage fails loudly rather than quietly dropping letters.
export const GLYPHS = '|ÅýÖÜWjÀÁÂÇÈÉÊÌÍÎÒÓÔÙÚÛÝÿ$ÄÃËÏÑÕþ()@[]{}Æ§\\/åæQ%äöüfgwØàáâèéêëìíîðòóôùúû&03689?CGMOSUimpqyãçïñõ©µ¿€!#12457ABDEFHIJKLNPRTVXYZbdhklßÐÞ¡¢£¥;tøaceos®<>nruvxz:«»~+=_ªº*^°-"\',`.';

const FOLD = {
  '…': '...', '×': 'x', '·': '-', '–': '-', '—': '-', '‘': "'", '’': "'",
  '“': '"', '”': '"', '→': '->', '←': '<-', '•': '-', ' ': ' ',
};

// Fold what has a plain-ASCII stand-in, drop what does not. Spaces survive;
// every other whitespace character is the caller's problem, because the two
// callers below disagree about what to do with it.
function keep(text) {
  let out = '';
  for (const ch of String(text == null ? '' : text)) {
    const c = FOLD[ch] !== undefined ? FOLD[ch] : ch;
    for (const k of c) out += (k === ' ' || GLYPHS.includes(k)) ? k : '';
  }
  return out;
}

export function safe(text) {
  return keep(String(text == null ? '' : text).replace(/\s+/g, ' ')).trim();
}

// The same filter, for text whose SHAPE carries meaning: a fenced code block is
// three levels of indentation and a line break away from being unreadable, and
// `safe` would hand back one long line. Tabs land as two spaces because the
// sheet has no tab and the room has no tab stops.
export function safeBlock(text) {
  return String(text == null ? '' : text)
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '  ')
    .split('\n')
    .map((line) => keep(line).replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');
}
