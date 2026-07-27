// How a file being edited is written into a chat message — the whole point of
// the co-edit surface: the lieutenant has to receive WHICH file and WHICH lines
// the captain means, not just the sentence he typed.
//
// The context leads the message text, so it arrives with it through the one
// delivery path that already exists (feedback → queue item → harness). No new
// scope, no new storage: the message still belongs to the card's thread.
//
// DOM-free on purpose — the format is the contract with the agent, so it is
// unit-tested directly (test/filectx.test.js).

// Fence language for a filename. Bare extension for anything not listed: a
// wrong-but-harmless hint beats no hint, and the agent reads the filename too.
export function fileLang(name) {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
  const ext = m ? m[1].toLowerCase() : '';
  return { markdown: 'md', prompt: 'md', javascript: 'js', python: 'py', shell: 'sh', yml: 'yaml' }[ext] || ext;
}

// ctx: { name, lines?, text? } — the file always, the selection when there is
// one. Returns the prefix that leads the captain's own words (or '' when there
// is no file context at all).
export function fileContextBlock(ctx) {
  if (!ctx || !ctx.name) return '';
  if (!ctx.text) return '📎 `' + ctx.name + '` — open in the editor\n\n';
  // The fence outruns any backtick run inside the snippet, so a selection that
  // is itself markdown can't break out of the block it is quoted in.
  const runs = (ctx.text.match(/`+/g) || []).map((s) => s.length + 1);
  const fence = '`'.repeat(Math.max(3, ...runs, 3));
  return '📎 `' + ctx.name + '`' + (ctx.lines ? ' L' + ctx.lines : '') + '\n' +
    fence + fileLang(ctx.name) + '\n' + ctx.text + '\n' + fence + '\n\n';
}
