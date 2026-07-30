'use strict';
// stage — the mechanical half of a round: run the commands, open the agent,
// wait for its answer. No judgement lives here (or anywhere else in the
// executor): the agent decides WHAT, this decides nothing at all.
//
// The agent is opened as a WINDOW OF THE EXECUTOR'S OWN SESSION. That is not
// cosmetic — a lieutenant attaching to the session finds the implementer and
// the validator sitting next to the executor, which is where there is
// something to watch. An orchestrator that spawned its agents into sessions of
// their own would leave the watcher looking at a log.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, execFile } = require('node:child_process');
const { getHarness } = require('../harness/port.js');
const agentStatus = require('../harness/agent-status.js');
const verdict = require('./verdict.js');

const POLL_MS = Number(process.env.BC_PIPELINE_POLL_MS || 5000);
const RUN_TIMEOUT_MS = Number(process.env.BC_PIPELINE_RUN_TIMEOUT_MS || 45 * 60 * 1000);

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ownSession() -> tmux session name | null. The executor asks tmux which
// session its own pane is in; that is the whole "know where I live" story, and
// it costs the board nothing (nothing had to tell us).
function ownSession() {
  if (!process.env.TMUX || !process.env.TMUX_PANE) return null;
  try {
    const out = execFileSync('tmux',
      ['display-message', '-p', '-t', process.env.TMUX_PANE, '#{session_name}'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return /^bc-[A-Za-z0-9_-]+$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

// ownWindow() -> the executor's own tmux window name, or null. Same trick as
// ownSession: the process asks tmux where it lives, and nothing had to tell it.
// The executor's window is worth offering the pane drawer as a tab — it is
// where the routing decisions are printed.
function ownWindow() {
  if (!process.env.TMUX || !process.env.TMUX_PANE) return null;
  try {
    const out = execFileSync('tmux',
      ['display-message', '-p', '-t', process.env.TMUX_PANE, '#{window_name}'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return /^[A-Za-z0-9_.-]{1,80}$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

// windowName — the stage agent's window inside that session. `s-` keeps it
// clear of the board's own `w-<card>` worker window (which is the executor
// itself) and of tmux's numeric-name trap. The validator is a fresh session
// every round, so its window carries the round.
function windowName(cardId, stage, round) {
  const id = String(cardId).replace(/[^A-Za-z0-9_-]/g, '-');
  return stage === 'working' ? `s-${id}-impl` : `s-${id}-val${round}`;
}

// reapOrphans(session, cardId, keep) -> the window names it killed.
//
// The executor's stage agents are its children in name only: tmux keeps them
// running when the executor is paused, killed or dies. They keep editing, keep
// committing, and keep writing verdict files — so the next run reads an answer
// nobody in it produced, and then dies on a window name that is already taken.
// Both of those happened on the first real run of this pipeline.
//
// A window is this card's, and unknown to this run's state, or it is not.
// `keep` holds the windows this run is legitimately resuming.
function reapOrphans(session, cardId, keep = []) {
  if (!session) return [];
  const id = String(cardId).replace(/[^A-Za-z0-9_-]/g, '-');
  const mine = new RegExp(`^s-${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(impl|val\\d+)$`);
  let windows;
  try {
    windows = execFileSync('tmux', ['list-windows', '-t', session, '-F', '#{window_name}'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').filter(Boolean);
  } catch {
    return []; // no session, nothing to reap
  }
  const killed = [];
  for (const w of windows) {
    if (!mine.test(w) || keep.includes(w)) continue;
    try {
      execFileSync('tmux', ['kill-window', '-t', `${session}:${w}`], { stdio: 'ignore' });
      killed.push(w);
    } catch { /* raced with its own exit — already gone is the outcome we wanted */ }
  }
  return killed;
}

// runCommands(lines, cwd) -> transcript text.
// A non-zero exit is NOT a failure here: the whole point of the validation run
// is that it stops at the first finding, and that output is the material the
// validator reads. Everything — stdout, stderr, exit code — goes in verbatim.
async function runCommands(lines, cwd) {
  const parts = [];
  for (const line of lines) {
    const r = await sh(line, cwd);
    parts.push(`$ ${line}\n${r.output}${r.note}`);
  }
  return parts.join('\n\n');
}
function sh(line, cwd) {
  return new Promise((resolve) => {
    execFile('sh', ['-c', line], { cwd, encoding: 'utf8', timeout: RUN_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const output = String(stdout || '') + String(stderr || '');
        let note = '';
        if (err && err.killed) note = `\n[timed out after ${Math.round(RUN_TIMEOUT_MS / 60000)}min]`;
        else if (err && typeof err.code === 'number' && err.code !== 0) note = `\n[exit ${err.code}]`;
        else if (err) note = `\n[could not run: ${err.message}]`;
        resolve({ output, note });
      });
  });
}

// deliver(...) -> HarnessRef — put the prompt in front of an agent.
//   fresh: true  the stage wants a reader who has not seen this before, so a
//                brand-new session every time (the validator)
//   fresh: false the stage keeps its session across rounds, so the implementer
//                still remembers what the last round of findings taught it
async function deliver({ harness, cwd, session, window, prompt, stateDir, ref, fresh }) {
  const impl = getHarness(harness);
  if (fresh || !ref) {
    if (ref) { try { await impl.kill(ref); } catch { /* already gone */ } }
    return impl.spawn(cwd, prompt, { session, window, stateDir, installHooks: false });
  }
  let live = ref;
  if (!(await impl.alive(ref))) live = await impl.resume(ref, { stateDir, installHooks: false });
  await impl.send(live, prompt);
  return live;
}

// waitForVerdict(...) -> { verdict, ref }
// Polls the verdict file the agent writes. An agent that dies without
// answering gets ONE revival (its memory comes back with it, and a nudge tells
// it to finish); a second death is not the executor's call to make —
// `verdict: null` comes back and the caller rings the lieutenant.
async function waitForVerdict({ harness, ref, file, onRevive, pollMs = POLL_MS }) {
  const impl = getHarness(harness);
  let current = ref;
  let revived = false;
  for (;;) {
    const v = verdict.read(file);
    if (v) return { verdict: v, ref: current };
    let up = true;
    try { up = await impl.alive(current); } catch { up = false; }
    if (!up) {
      const late = verdict.read(file); // wrote its answer, then exited
      if (late) return { verdict: late, ref: current };
      if (revived) return { verdict: null, ref: current };
      revived = true;
      current = await impl.resume(current, { installHooks: false });
      await impl.send(current, 'Your session was restarted and you did not report a verdict yet. '
        + 'Pick up where you left off and finish the stage with the command you were given.');
      if (onRevive) onRevive(current);
    }
    await sleep(pollMs);
  }
}

// transcriptOf(ref) -> { path, bytes } | null
//
// The journal records what the EXECUTOR knows — the prompt it sent, the verdict
// it got back. The agent's own reasoning, every file it read, every approach it
// tried and dropped, lives in the harness's session transcript. That is the
// half you want when a run confuses you six weeks later.
//
// A POINTER, not a copy, and not inline. Transcripts are megabytes and are read
// one at a time; prompts and verdicts are kilobytes and are what you query
// across many runs. Duplicating a megabyte per stage to guard against a cleanup
// that has never happened is storage spent on a hypothetical.
//
// The implementer keeps ONE session across rounds, so both rounds point at the
// same growing file. That is the truth of what it saw.
//
// Best effort throughout: an unknown harness, no session yet, or a transcript
// that is not there returns null. This must never cost anyone a run.
function transcriptOf(ref) {
  try {
    const src = transcriptPath(ref);
    if (!src || !fs.existsSync(src)) return null;
    return { path: src, bytes: fs.statSync(src).size };
  } catch {
    return null;
  }
}

function transcriptPath(ref) {
  if (!ref) return null;
  if (ref.harness === 'claude' && ref.resumeId) {
    const projects = process.env.BC_CLAUDE_PROJECTS_DIR
      || path.join(os.homedir(), '.claude', 'projects');
    return path.join(projects, agentStatus.claudeProjectSlug(ref.cwd), ref.resumeId + '.jsonl');
  }
  if (ref.harness === 'codex' && ref.resumeId) {
    return agentStatus.codexRolloutFile(ref.resumeId,
      process.env.BC_CODEX_SESSIONS_DIR || path.join(os.homedir(), '.codex', 'sessions'));
  }
  return null;
}

module.exports = {
  ownSession, ownWindow, windowName, reapOrphans, runCommands, deliver, waitForVerdict, sleep,
  transcriptOf, transcriptPath,
};
