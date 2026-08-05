'use strict';
// bin/nm-clerk.sh — the bash driver that answers no-mistakes' gates without a
// model. It shells out to `no-mistakes axi`, which takes minutes and needs a
// real repo, so every test here replaces that binary (NM_BIN) with a fake that
// replays payloads RECORDED FROM REAL RUNS (test/fixtures/nm-clerk/*.toon) and
// logs the argv it was handed.
//
// What is asserted: the three outcomes the pipeline routes on, read from
// $ARTIFACTS_DIR/nm-outcome, and an exit status that is ALWAYS 0 — a non-zero
// exit inside an Archon loop_group kills the whole run.
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLERK = path.join(__dirname, '..', 'bin', 'nm-clerk.sh');
const FIXTURES = path.join(__dirname, 'fixtures', 'nm-clerk');

const fixture = name => fs.readFileSync(path.join(FIXTURES, `${name}.toon`), 'utf8');

// A fake `no-mistakes` that prints replies[n] on its nth call (the last reply
// repeats forever, which is how the runaway-fixer case is built) and appends
// its arguments to calls.log, one invocation per line.
function fakeNoMistakes(dir, replies) {
  const stateDir = path.join(dir, 'fake');
  fs.mkdirSync(stateDir, { recursive: true });
  replies.forEach((r, i) => fs.writeFileSync(path.join(stateDir, `reply-${i + 1}`), r));
  fs.writeFileSync(path.join(stateDir, 'last'), replies[replies.length - 1]);
  const bin = path.join(dir, 'no-mistakes');
  fs.writeFileSync(bin, `#!/usr/bin/env bash
d=${JSON.stringify(stateDir)}
n=$(( $(cat "$d/n" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$d/n"
args="$*"; printf '%s\\n' "\${args//$'\\n'/ }" >> "$d/calls.log"   # one line per invocation
cat "$d/reply-$n" 2>/dev/null || cat "$d/last"
`);
  fs.chmodSync(bin, 0o755);
  return bin;
}

// run(replies) -> { status, stdout, outcome, escalation, calls }
function run(replies, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nm-clerk-'));
  const bin = fakeNoMistakes(dir, replies);
  const intent = path.join(dir, 'intent.md');
  fs.writeFileSync(intent, 'REQUIRED: the tile click keeps the selection.\nFORBIDDEN: removing the drag.\n');

  let status = 0;
  let stdout = '';
  try {
    stdout = execFileSync('bash', [CLERK, '--intent-file', intent], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NM_BIN: bin, ARTIFACTS_DIR: dir, NM_CLERK_LOG: path.join(dir, 'nm.log'), ...env },
    });
  } catch (e) {
    status = e.status;
    stdout = e.stdout || '';
  }
  const read = f => (fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), 'utf8') : null);
  return {
    status,
    stdout,
    outcome: (read('nm-outcome') || '').trim(),
    escalation: read('escalation.md'),
    calls: (read('fake/calls.log') || '').trim().split('\n').filter(Boolean),
  };
}

// ---------- passed ----------

test('drives a real run through awaiting_approval and fix_review to passed', () => {
  const r = run([
    fixture('gate-awaiting-approval'),
    fixture('gate-fix-review'),
    fixture('outcome-passed'),
  ]);

  assert.equal(r.status, 0);
  assert.equal(r.outcome, 'passed');
  assert.equal(r.escalation, null, 'nothing was escalated');

  // The intent reached `axi run`, and each gate was answered by finding id.
  assert.match(r.calls[0], /^axi run --intent REQUIRED: the tile click keeps the selection\./);
  assert.equal(
    r.calls[1],
    'axi respond --action fix --findings missing-import-average-discount,empty-prices-zero-division'
  );
  assert.equal(
    r.calls[2],
    'axi respond --action fix --findings committed-pycache-artifacts,manual-raises-assertion'
  );
});

test('approves a gate whose findings are all no-op', () => {
  const noop = fixture('gate-awaiting-approval').replace(/,auto-fix,/g, ',no-op,');
  const r = run([noop, fixture('outcome-passed')]);

  assert.equal(r.status, 0);
  assert.equal(r.outcome, 'passed');
  assert.equal(r.calls[1], 'axi respond --action approve');
  assert.match(r.stdout, /approve — nothing actionable at gate awaiting_approval/);
});

// ---------- escalated ----------

test('an ask-user finding parks: escalation.md written, nothing resolved', () => {
  const r = run([fixture('gate-ask-user'), fixture('outcome-passed')]);

  assert.equal(r.status, 0, 'a bash node that exits non-zero kills the loop_group');
  assert.equal(r.outcome, 'escalated');

  // Exactly one call: the run. It never answered the gate.
  assert.equal(r.calls.length, 1);
  assert.match(r.calls[0], /^axi run /);

  // The whole payload is on the file, all four findings included.
  assert.match(r.escalation, /ask-user finding/);
  for (const id of [
    'drag-starting-on-tile-no-longer-selects',
    'tests-assert-helper-not-behavior',
    'tile-prefix-string-heuristic',
    'tests-share-mutable-global',
  ]) {
    assert.ok(r.escalation.includes(id), `escalation.md is missing ${id}`);
  }
  // And the ask-user ids — not the auto-fix one — are named as the reason.
  assert.match(r.stdout, /ask-user finding\(s\) at gate awaiting_approval: drag-starting-on-tile-no-longer-selects,tests-assert-helper-not-behavior,tile-prefix-string-heuristic/);
});

// ---------- failed ----------

test('a fixer that keeps producing findings stops at the round cap', () => {
  // The real shape: run 1's fixer committed __pycache__ and the next gate
  // flagged its own artifact. This fixture repeats forever.
  const r = run([fixture('gate-awaiting-approval'), fixture('gate-fix-review')]);

  assert.equal(r.status, 0);
  assert.equal(r.outcome, 'failed');
  assert.match(r.stdout, /fix-round cap \(3\) reached at gate fix_review/);
  // 1 run + 3 fixes, and then it stopped rather than sending a fourth.
  assert.equal(r.calls.length, 4);
  assert.equal(r.calls.filter(c => c.includes('--action fix')).length, 3);
});

test('a precondition error is failed, not a crash', () => {
  const r = run(['error: uncommitted changes in the working tree\nhelp[1]: Commit your work before validating\n']);

  assert.equal(r.status, 0);
  assert.equal(r.outcome, 'failed');
  assert.match(r.stdout, /refused to run: uncommitted changes in the working tree/);
  assert.equal(r.calls.length, 1);
});

test('an unfamiliar gate status is failed rather than guessed at', () => {
  const r = run([fixture('gate-awaiting-approval').replace('status: awaiting_approval', 'status: awaiting_something_new')]);

  assert.equal(r.status, 0);
  assert.equal(r.outcome, 'failed');
  assert.match(r.stdout, /unknown gate status: awaiting_something_new/);
  assert.equal(r.calls.length, 1, 'it answered nothing');
});

// ---------- the parser ----------

test('columns are read from the header, not counted from the left', () => {
  // Same gate with the findings table transposed: action first, id last.
  const src = fixture('gate-awaiting-approval');
  const reordered = src
    .replace('findings[2]{id,severity,file,action,description}:', 'findings[2]{action,file,severity,description,id}:')
    .replace(
      /^ {4}missing-import-average-discount,error,test_calc\.py,auto-fix,(".*")$/m,
      '    auto-fix,test_calc.py,error,$1,missing-import-average-discount'
    )
    .replace(
      /^ {4}empty-prices-zero-division,warning,calc\.py,auto-fix,(".*")$/m,
      '    auto-fix,calc.py,warning,$1,empty-prices-zero-division'
    );
  assert.notEqual(reordered, src, 'the fixture rewrite matched nothing');

  const r = run([reordered, fixture('outcome-passed')]);
  assert.equal(r.outcome, 'passed');
  assert.equal(
    r.calls[1],
    'axi respond --action fix --findings missing-import-average-discount,empty-prices-zero-division'
  );
});

test('a description full of commas and escaped quotes does not shift the columns', () => {
  // gate-ask-user's descriptions carry both. If the split were naive, the
  // ask-user rows would parse as something else and the clerk would answer.
  const r = run([fixture('gate-ask-user')]);
  assert.equal(r.outcome, 'escalated');
});

test('a missing --intent-file is failed, not a usage crash', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nm-clerk-'));
  let status = 0;
  try {
    execFileSync('bash', [CLERK], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ARTIFACTS_DIR: dir },
    });
  } catch (e) {
    status = e.status;
  }
  assert.equal(status, 0);
  assert.equal(fs.readFileSync(path.join(dir, 'nm-outcome'), 'utf8').trim(), 'failed');
});
