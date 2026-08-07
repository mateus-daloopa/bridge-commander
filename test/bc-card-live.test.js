'use strict';
// bin/bc-card-live.sh — is the workflow file actually busy?
//
// `setup` writes a line into .bc-card.live and `cleanup` removes it, which holds
// until a run never reaches cleanup. Then the line stays forever and the ticket
// claims the workflow is busy for the rest of time — it did exactly that for two
// hours after a worker was killed. So the ticket is a hint, and this checks it
// against archon's own record of what became of each run.
//
// The case worth guarding hardest is `paused`: a paused run holds no process by
// design, so "nothing is running" must not be read as "dead" — a human is being
// asked, and the workflow they will wake into must not be edited underneath them.
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const LIVE = path.join(__dirname, '..', 'bin', 'bc-card-live.sh');

// run(runs, ticketLines, argv) -> { code, stdout, stderr, ticket }
// `runs` is [id, status]; a ticket line naming an id absent from `runs` stands
// for a run archon has never heard of.
function run(runs, ticketLines, argv = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-live-'));
  const db = path.join(dir, 'archon.db');
  const sql = [
    'create table remote_agent_workflow_runs (id text primary key, status text);',
    ...runs.map(([id, st]) => `insert into remote_agent_workflow_runs values ('${id}', '${st}');`),
  ].join('\n');
  execFileSync('/usr/bin/python3', [
    '-c',
    `import sqlite3,sys;c=sqlite3.connect(${JSON.stringify(db)});c.executescript(sys.stdin.read());c.commit()`,
  ], { input: sql });

  const ticket = path.join(dir, '.bc-card.live');
  if (ticketLines !== null) fs.writeFileSync(ticket, ticketLines.map(l => l + '\n').join(''));

  // spawnSync, not execFileSync: exit 1 means "something is live", which is a
  // normal answer here, and execFileSync throws away stderr on a zero exit.
  const p = spawnSync('/usr/bin/python3', [LIVE, ...argv], {
    encoding: 'utf8',
    env: { ...process.env, ARCHON_DB: db, BC_LIVE_FILE: ticket },
  });
  const code = p.status, stdout = p.stdout || '', stderr = p.stderr || '';
  const after = fs.existsSync(ticket) ? fs.readFileSync(ticket, 'utf8') : null;
  return { code, stdout, stderr, ticket: after };
}

const line = (id, card) => `${id}\t${card}\t2026-08-07T00:00:00Z`;

test('a running run is live — exit 1, and the ticket is left alone', () => {
  const r = run([['aaa', 'running']], [line('aaa', 'MNC-1')], ['--prune']);

  assert.equal(r.code, 1);
  assert.match(r.stdout, /aaa\tMNC-1/);
  assert.match(r.ticket, /aaa/);
});

test('a PAUSED run is live — it holds no process by design and a human is being asked', () => {
  const r = run([['bbb', 'paused']], [line('bbb', 'MNC-2')], ['--prune']);

  assert.equal(r.code, 1, 'a paused run was treated as dead');
  assert.match(r.ticket, /bbb/, 'the line a human is about to wake into was pruned');
});

test('a completed run is dead and gets pruned — this is the two-hour lie', () => {
  const r = run([['ccc', 'completed']], [line('ccc', 'CMD-1')], ['--prune']);

  assert.equal(r.code, 0, 'nothing is live, so the workflow is editable');
  assert.equal(r.ticket, null, 'the last dead line should take the file with it');
  assert.match(r.stderr, /pruned 1 dead line/);
});

test('failed and cancelled are dead too', () => {
  for (const st of ['failed', 'cancelled']) {
    const r = run([['ddd', st]], [line('ddd', 'MNC-3')], ['--prune']);
    assert.equal(r.code, 0, `${st} was treated as live`);
  }
});

test('a run archon has never heard of is dead', () => {
  const r = run([], [line('eee', 'MNC-4')], ['--prune']);

  assert.equal(r.code, 0);
  assert.match(r.stderr, /unknown to archon/);
});

test('one live among the dead keeps the file and keeps only itself', () => {
  const r = run(
    [['aaa', 'completed'], ['bbb', 'running'], ['ccc', 'failed']],
    [line('aaa', 'MNC-1'), line('bbb', 'MNC-2'), line('ccc', 'MNC-3')],
    ['--prune']
  );

  assert.equal(r.code, 1);
  assert.match(r.ticket, /bbb/);
  assert.doesNotMatch(r.ticket, /aaa/);
  assert.doesNotMatch(r.ticket, /ccc/);
});

test('without --prune nothing is written, however dead the lines are', () => {
  const r = run([['aaa', 'completed']], [line('aaa', 'MNC-1')]);

  assert.equal(r.code, 0);
  assert.match(r.ticket, /aaa/, 'it pruned without being asked');
});

test('no ticket at all is silence and a clear workflow', () => {
  const r = run([], null);

  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});

test('an unreadable database reports everything live rather than guessing', () => {
  // A broken check must never be the reason a live workflow gets edited.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-live-'));
  const ticket = path.join(dir, '.bc-card.live');
  fs.writeFileSync(ticket, line('aaa', 'MNC-1') + '\n');

  const p = spawnSync('/usr/bin/python3', [LIVE, '--prune'], {
    encoding: 'utf8',
    env: { ...process.env, ARCHON_DB: path.join(dir, 'nope.db'), BC_LIVE_FILE: ticket },
  });
  const code = p.status, stderr = p.stderr || '';
  assert.equal(code, 1);
  assert.match(stderr, /cannot read archon's database/);
  assert.match(fs.readFileSync(ticket, 'utf8'), /aaa/, 'it pruned on a failed check');
});
