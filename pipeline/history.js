#!/usr/bin/env node
'use strict';
// history — read the journal back.
//
//   pipeline/history.js --workspace <dir> [--card <id>] [--last N]
//                       [--rejections] [--run <id>] [--json]
//
// The journal is only worth writing if asking it a question is one command.
// The questions it is built for:
//
//   how often does round one get rejected      →  the summary line
//   what do validators keep catching           →  --rejections
//   what exactly happened in that one run      →  --run <id>
//
// Read-only, always. Nothing here can change a card, a run, or the journal.

const path = require('node:path');
const journal = require('./journal.js');

function parseArgs(argv) {
  const out = { workspace: process.env.BC_WORKSPACE || '', card: '', last: 0, json: false, rejections: false, run: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workspace') out.workspace = argv[++i];
    else if (a === '--card') out.card = argv[++i];
    else if (a === '--run') out.run = argv[++i];
    else if (a === '--last') out.last = parseInt(argv[++i], 10);
    else if (a === '--json') out.json = true;
    else if (a === '--rejections') out.rejections = true;
    else throw new Error(`unexpected argument ${a}`);
  }
  if (!out.workspace) throw new Error('--workspace <dir> is required (or BC_WORKSPACE)');
  return out;
}

function when(ts) { return String(ts || '').replace('T', ' ').slice(0, 16); }
function firstLine(s) { return String(s || '').trim().split('\n').find((l) => l.trim()) || ''; }

// The one-run view: every event in order, so "what happened" is answerable
// without reading JSON by hand.
function printRun(records, runIdWanted, out) {
  const rows = records.filter((r) => r.run === runIdWanted);
  if (!rows.length) { out(`no run ${runIdWanted} in this journal`); return 1; }
  out(`run ${runIdWanted}`);
  let prev = null;
  for (const r of rows) {
    const gap = prev ? journal.human(Date.parse(r.ts) - Date.parse(prev)) : '';
    prev = r.ts;
    const where = r.stage ? ` ${r.stage} r${r.round}` : '';
    let detail = '';
    if (r.kind === 'start') detail = `${r.resumed ? 'resumed' : 'first start'} · base ${String(r.base || '?').slice(0, 12)} · ${r.branch || ''}`;
    else if (r.kind === 'verdict') {
      detail = `${r.verdict} — ${firstLine(r.text)}`;
      // The pointer, printed where you are already looking: this is the view
      // you are in when you want to know what the agent was actually thinking.
      if (r.transcript) detail += `\n${' '.repeat(35)}transcript: ${r.transcript}`;
    }
    else if (r.kind === 'stage-open') detail = `${r.fresh ? 'fresh agent' : 'same agent'} ${r.agent || ''} · prompt ${String(r.prompt || '').length} chars`;
    else if (r.kind === 'run') detail = `${(r.commands || []).length} command(s) · ${String(r.output || '').length} chars out`;
    else detail = firstLine(r.outcome || r.text || '');
    // The gap is the interesting column: it is how long the executor waited on
    // that agent, which is where all the time in a run actually goes.
    out(`  ${when(r.ts)}  ${gap.padStart(5)}  ${(r.kind + where).padEnd(24)} ${detail}`);
  }
  return 0;
}

function main(argv, out = (s) => process.stdout.write(s + '\n')) {
  const opts = parseArgs(argv);
  const records = journal.read(opts.workspace);
  if (!records.length) {
    out(`no pipeline history in ${path.relative(process.cwd(), journal.journalFile(opts.workspace)) || journal.journalFile(opts.workspace)}`);
    return 0;
  }
  if (opts.run) return printRun(records, opts.run, out);

  let rows = journal.runs(opts.workspace);
  if (opts.card) rows = rows.filter((r) => r.card === opts.card);
  if (opts.last > 0) rows = rows.slice(-opts.last);
  if (opts.json) { out(JSON.stringify(rows, null, 2)); return 0; }

  if (opts.rejections) {
    // Every rejection ever written, whole. This is the corpus: the pipeline's
    // own record of what a second reader kept finding that the first missed.
    let n = 0;
    for (const r of rows) {
      for (const rej of r.rejections) {
        n++;
        out(`\n${'─'.repeat(72)}\n${r.card} · round ${rej.round} · ${when(r.started)}\n`);
        out(rej.text);
      }
    }
    out(`\n${n} rejection(s) across ${rows.length} run(s).`);
    return 0;
  }

  // The default view: one line per run, then the numbers worth acting on.
  for (const r of rows) {
    const outcome = r.outcomeKind === 'finish' ? '✔ delivered'
      : r.outcomeKind === 'escalate' ? '⚠ escalated'
        : r.outcomeKind === 'refused' ? '✖ refused'
          : '… unfinished';
    out(`${when(r.started)}  ${String(r.card).slice(0, 32).padEnd(34)} ${String(r.pipeline).padEnd(14)} `
      + `${r.rounds} round${r.rounds === 1 ? ' ' : 's'}  ${r.rejections.length} rej  `
      + `${journal.human(r.ms).padStart(5)}  ${outcome}`
      + (r.restarts ? `  (${r.restarts} restart${r.restarts === 1 ? '' : 's'})` : ''));
    // Where the time went, stage by stage — the answer to "is the cost in
    // building it or in reviewing it", and to "what did that bounce cost me".
    if (r.stages.length) {
      const kept = r.stages.filter((s) => s.transcript).length;
      out(`${' '.repeat(18)}${r.stages.map((s) => `${s.stage.slice(0, 4)} r${s.round} ${journal.human(s.ms)}`).join(' · ')}`
        + (kept ? `  ·  ${kept} transcript${kept === 1 ? '' : 's'} kept` : ''));
    }
    if (r.outcome) out(`${' '.repeat(18)}${firstLine(r.outcome).slice(0, 110)}`);
  }

  const done = rows.filter((r) => r.outcomeKind === 'finish');
  const bounced = rows.filter((r) => r.rejections.length > 0);
  const cleanFirst = done.filter((r) => r.rejections.length === 0);
  out('');
  out(`${rows.length} run(s): ${done.length} delivered, `
    + `${rows.filter((r) => r.outcomeKind === 'escalate').length} escalated, `
    + `${rows.filter((r) => r.outcomeKind === 'refused').length} refused, `
    + `${rows.filter((r) => !r.outcomeKind).length} unfinished.`);
  out(`${bounced.length} were rejected at least once; ${cleanFirst.length} went through untouched.`);
  // What a bounce costs. The whole case for the validator rests on this number
  // staying smaller than the cost of the bug reaching the captain.
  const avg = (rs) => {
    const v = rs.map((r) => r.ms).filter((m) => Number.isFinite(m));
    return v.length ? journal.human(v.reduce((a, b) => a + b, 0) / v.length) : '—';
  };
  if (done.length) {
    out(`delivered runs took ${avg(done)} on average — ${avg(cleanFirst)} clean, `
      + `${avg(done.filter((r) => r.rejections.length))} after a bounce.`);
  }
  out('');
  out('  --rejections   every finding, whole — what validators keep catching');
  out('  --run <id>     one run, event by event');
  return 0;
}

if (require.main === module) {
  try { process.exit(main(process.argv.slice(2))); }
  catch (err) { process.stderr.write(String((err && err.message) || err) + '\n'); process.exit(1); }
}

module.exports = { main, parseArgs };
