'use strict';
// The screens a launch has to walk through, pinned against what a real terminal
// actually printed.
//
// This exists because of a morning that was lost: the tmux server restarted,
// supervision found eight lieutenants dead, revived five, and gave up on three.
// The three it gave up on were the ones with the most context — because
// `claude --resume` only shows its "resume from summary or in full?" picker
// when there is enough transcript to be worth warning about. The harness had no
// idea what that screen was, waited 45s for a UI that was never coming, and
// flagged needs-captain three times over.
//
// The captures below are verbatim from that morning.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { SETTLE } = require(path.join(__dirname, '..', 'claude-tmux.js'));

// What `claude --dangerously-skip-permissions --resume <id>` printed for Waldir
// and Holmes, and sat on for 45 seconds.
const RESUME_PICKER = `
  Resuming the full session will consume a substantial portion of
  your usage limits. We recommend resuming from a summary.

  ❯ 1. Resume from summary (recommended)
    2. Resume full session as-is
    3. Don't ask me again

  Enter to confirm · Esc to cancel
`;

// The main UI, once it is actually up — Selma, resumed, mid-compact.
const READY = `
✻ Cooked for 22s

❯ /compact

* Compacting conversation…
───────────────────────────────────────────────────────────────────────
❯
───────────────────────────────────────────────────────────────────────
  Opus 5 | █████░░░░░░░░░░░░░░░ 27% | 270k/1000k | 5h 5% (3h17m) | 7d…
  ⏵⏵ bypass permissions on (shift+tab to cycle) · ← for agents
`;

test('the resume picker is recognised as a menu to answer', () => {
  assert.ok(SETTLE.resumeRe.test(RESUME_PICKER),
    'unanswered, this screen costs a lieutenant its whole context');
});

test('the resume picker must NOT read as a ready UI', () => {
  // The near miss that made the bug quiet rather than loud: the picker draws
  // its own ❯, and only the column-zero anchor in readyRe keeps it from
  // matching. Relax that anchor and every unattended revival silently parks a
  // lieutenant on a menu nobody will ever press Enter on.
  assert.ok(!SETTLE.readyRe.test(RESUME_PICKER),
    'a menu mistaken for a ready UI is a lieutenant that never comes back');
});

test('the real UI still reads as ready', () => {
  assert.ok(SETTLE.readyRe.test(READY));
});

test('the ready UI is not mistaken for a menu — Enter there is a stray keystroke', () => {
  assert.ok(!SETTLE.resumeRe.test(READY));
  assert.ok(!SETTLE.trustRe.test(READY));
});

test('the trust screen is still recognised, and is not the resume picker', () => {
  const TRUST = '\n  Do you trust the files in this folder?\n\n  ❯ 1. Yes, I trust this folder\n';
  assert.ok(SETTLE.trustRe.test(TRUST));
  assert.ok(!SETTLE.resumeRe.test(TRUST));
});

// Recognising the screen is half of it. The half that actually failed that
// morning is the WIRING — whether launchAndSettle does anything about it.
test('a resume that meets the picker answers it and comes up', async () => {
  const claude = require(path.join(__dirname, '..', 'claude-tmux.js'));
  const { mockTmux } = require('./tmux-mock.js');
  const fs = require('node:fs');
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-settle-'));
  const m = mockTmux({ readyTail: [RESUME_PICKER, READY] });
  try {
    const ref = { harness: 'claude', session: 'bc-selma', window: 'lt', cwd: dir, resumeId: 'uuid-1' };
    const out = await claude.resume(ref, { stateDir: dir, installHooks: false });
    assert.strictEqual(out.resumeId, 'uuid-1', 'it came back with its memory, not a fresh session');

    const launch = m.calls.find((c) => c.fn === 'sendLiteral');
    assert.match(launch.args[1], /--resume uuid-1/);
    // One Enter submits the launch line; the second is the answer to the
    // picker. Without it the loop spins for 45s and the lieutenant stays dead.
    const enters = m.calls.filter((c) => c.fn === 'sendKey' && c.args[1] === 'Enter');
    assert.ok(enters.length >= 2, `the picker was never answered (${enters.length} Enter sent)`);
  } finally {
    m.restore();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
