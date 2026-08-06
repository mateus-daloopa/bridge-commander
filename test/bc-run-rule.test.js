'use strict';
// bin/bc-run.sh — `rule`, the grammar a lieutenant answers a parked gate with.
//
// It is the one piece of the card pipeline a human types by hand, at the worst
// possible moment: a run is holding, findings are on the screen, and whatever
// they type is what the fixer hears. A misread `fix a,b : do X` sends "do X" to
// nobody, or sends it as a finding id. So the grammar gets tests, and it lives
// in this file rather than in the workflow YAML so it can have them.
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BC_RUN = path.join(__dirname, '..', 'bin', 'bc-run.sh');

// bc-run.sh sources env.sh on the way in and returns 1 without one, so every
// call gets a scratch dir with the values a real run would have written.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-run-'));
fs.writeFileSync(path.join(dir, 'env.sh'), 'BC=/bin/true\nCARD=MNC-0\nWORKSPACE=/tmp\nREPORTS=' + dir + '\n');

// rule(decision) -> { status, action, ids, instructions, rest }
function rule(decision) {
  const script = `
    . ${JSON.stringify(BC_RUN)} || exit 99
    rule ${JSON.stringify(decision)}; s=$?
    printf 'status=%s\\naction=%s\\nids=%s\\ninstructions=%s\\nrest=%s\\n' \
      "$s" "$RULE_ACTION" "$RULE_IDS" "$RULE_INSTRUCTIONS" "$RULE_REST"
  `;
  const out = execFileSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: { ...process.env, ARTIFACTS_DIR: dir },
  });
  const f = {};
  for (const line of out.trim().split('\n')) {
    const i = line.indexOf('=');
    f[line.slice(0, i)] = line.slice(i + 1);
  }
  return { status: Number(f.status), action: f.action, ids: f.ids, instructions: f.instructions, rest: f.rest };
}

test('a bare fix means everything the gate offered', () => {
  const r = rule('fix');
  assert.equal(r.status, 0);
  assert.equal(r.action, 'fix');
  assert.equal(r.ids, '');
  assert.equal(r.instructions, '');
});

test('fix with ids keeps the list verbatim', () => {
  const r = rule('fix lint-1,lint-2');
  assert.equal(r.status, 0);
  assert.equal(r.ids, 'lint-1,lint-2');
  assert.equal(r.instructions, '');
});

test('the colon splits which findings from what the finding got wrong', () => {
  const r = rule('fix lint-1,lint-2 : the unused export is deliberate, re-export it');
  assert.equal(r.status, 0);
  assert.equal(r.action, 'fix');
  assert.equal(r.ids, 'lint-1,lint-2');
  assert.equal(r.instructions, 'the unused export is deliberate, re-export it');
});

test('guidance with no ids still means every finding', () => {
  const r = rule('fix : keep the guard, widen the type');
  assert.equal(r.status, 0);
  assert.equal(r.ids, '', 'the empty side of the colon is not an id');
  assert.equal(r.instructions, 'keep the guard, widen the type');
});

test('a second colon belongs to the guidance, not the grammar', () => {
  const r = rule('fix lint-1 : see src/a.js: the cast is load-bearing');
  assert.equal(r.ids, 'lint-1');
  assert.equal(r.instructions, 'see src/a.js: the cast is load-bearing');
});

test('approve and skip take no argument', () => {
  for (const a of ['approve', 'skip']) {
    const r = rule(a);
    assert.equal(r.status, 0);
    assert.equal(r.action, a);
    assert.equal(r.ids, '');
  }
});

test('guidance on approve is REFUSED, never dropped in silence', () => {
  const r = rule('approve : but only because I am in a hurry');
  assert.equal(r.status, 2, 'a lieutenant who typed an argument must be told it went nowhere');
  assert.equal(r.action, 'approve');
});

test('abort keeps its whole reason, colons and all', () => {
  const r = rule('abort the card is wrong: shareOfTotal is not the lever');
  assert.equal(r.status, 0);
  assert.equal(r.action, 'abort');
  assert.equal(r.rest, 'the card is wrong: shareOfTotal is not the lever');
  assert.equal(r.instructions, '', 'abort has no fixer to instruct');
});

test('abort with no reason is still an abort', () => {
  const r = rule('abort');
  assert.equal(r.status, 0);
  assert.equal(r.action, 'abort');
  assert.equal(r.rest, '');
});

test('go keeps its whole instruction, colons and all', () => {
  const r = rule('go the judge is right but it is one sentence: say the freshness change in the PR body');
  assert.equal(r.status, 0);
  assert.equal(r.action, 'go');
  assert.equal(
    r.rest,
    'the judge is right but it is one sentence: say the freshness change in the PR body'
  );
  assert.equal(r.instructions, '', 'go instructs the implementer, not the fixer');
  assert.equal(r.ids, '', 'a planning stop has no findings to name');
});

test('a bare go is still a go', () => {
  const r = rule('go');
  assert.equal(r.status, 0);
  assert.equal(r.action, 'go');
  assert.equal(r.rest, '');
});

test('an unknown action is rejected rather than guessed at', () => {
  for (const d of ['merge-it', 'yes please', 'LGTM']) {
    assert.equal(rule(d).status, 1, `${d} was let through`);
  }
});

test('an empty decision is rejected', () => {
  assert.equal(rule('').status, 1);
  assert.equal(rule('   ').status, 1);
});

test('leading and trailing whitespace does not change the ruling', () => {
  const r = rule('   fix   lint-1   :   do X not Y   ');
  assert.equal(r.status, 0);
  assert.equal(r.action, 'fix');
  assert.equal(r.ids, 'lint-1');
  assert.equal(r.instructions, 'do X not Y');
});
