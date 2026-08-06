'use strict';
// bin/bc-revive.sh — the recovery for an archon run whose driver was killed.
//
// Archon refuses to resume anything that is not `failed` or `paused`, and a
// hard-killed run never wrote either: the row still says `running`, so the run
// is stranded. This corrects that status and hands the run to `workflow
// resume`. Because it WRITES to archon's database, the two guards matter more
// than the happy path: it must refuse a paused run (a human is being asked) and
// refuse one that still has a process driving it.
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REVIVE = path.join(__dirname, '..', 'bin', 'bc-revive.sh');

// A database with just the column set bc-revive reads and writes.
function makeDb(dir, runs) {
  const db = path.join(dir, 'archon.db');
  const sql = [
    `create table remote_agent_workflow_runs (id text primary key, conversation_id text,` +
      ` codebase_id text, workflow_name text, user_message text, status text,` +
      ` current_step_index int, metadata text, parent_conversation_id text, user_id text,` +
      ` started_at text, completed_at text, last_activity_at text, working_path text,` +
      ` parent_run_id text);`,
    ...runs.map(
      r =>
        `insert into remote_agent_workflow_runs (id, workflow_name, user_message, status)` +
        ` values ('${r.id}', '${r.workflow || 'bc-card'}', '${r.card || 'MNC-1'}', '${r.status}');`
    ),
  ].join('\n');
  execFileSync('/usr/bin/python3', [
    '-c',
    `import sqlite3,sys;c=sqlite3.connect(${JSON.stringify(db)});c.executescript(sys.stdin.read());c.commit()`,
  ], { input: sql });
  return db;
}

const status = (db, id) =>
  execFileSync('/usr/bin/python3', [
    '-c',
    `import sqlite3;print(list(sqlite3.connect(${JSON.stringify(db)}).execute("select status from remote_agent_workflow_runs where id=?",(${JSON.stringify(id)},)))[0][0])`,
  ], { encoding: 'utf8' }).trim();

// run(runs, argv, {psLines}) -> { code, stdout, stderr, db, archonArgs }
function run(runs, argv, { psLines = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-revive-'));
  const db = makeDb(dir, runs);

  // A fake `archon` that records the argv it was handed.
  const archon = path.join(dir, 'archon');
  const log = path.join(dir, 'archon-args');
  fs.writeFileSync(archon, `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(log)}\n`);
  fs.chmodSync(archon, 0o755);

  // A fake process table: the tests decide what is "running".
  const ps = path.join(dir, 'ps');
  fs.writeFileSync(ps, `#!/usr/bin/env bash\ncat ${JSON.stringify(path.join(dir, 'ps.txt'))}\n`);
  fs.chmodSync(ps, 0o755);
  fs.writeFileSync(path.join(dir, 'ps.txt'), psLines.join('\n') + '\n');

  let code = 0;
  let stdout = '';
  let stderr = '';
  try {
    stdout = execFileSync('/usr/bin/python3', [REVIVE, ...argv], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ARCHON_DB: db, ARCHON_CMD: archon, BC_REVIVE_PS: ps },
    });
  } catch (e) {
    code = e.status;
    stdout = e.stdout || '';
    stderr = e.stderr || '';
  }
  const archonArgs = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim() : '';
  return { code, stdout, stderr, db, archonArgs };
}

const CRASHED = { id: 'f0136b7ab44d68c1bef6b39d0108e6c0', status: 'running', card: 'MNC-22' };

test('a stranded run is marked failed and handed to workflow resume', () => {
  const r = run([CRASHED], ['f0136b7a']);

  assert.equal(r.code, 0);
  assert.equal(status(r.db, CRASHED.id), 'failed');
  assert.equal(r.archonArgs, `workflow resume ${CRASHED.id}`);
});

test('a PAUSED run is refused — that is a human being asked, not a crash', () => {
  const r = run([{ ...CRASHED, status: 'paused' }], ['f0136b7a']);

  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /PAUSED/);
  assert.match(r.stderr, /workflow approve/, 'it must point at the right door');
  assert.equal(status(r.db, CRASHED.id), 'paused', 'the row was not touched');
  assert.equal(r.archonArgs, '');
});

test('a completed run is refused', () => {
  const r = run([{ ...CRASHED, status: 'completed' }], ['f0136b7a']);

  assert.notEqual(r.code, 0);
  assert.equal(status(r.db, CRASHED.id), 'completed');
  assert.equal(r.archonArgs, '');
});

test('a run whose original driver is alive is refused', () => {
  const r = run([CRASHED], ['f0136b7a'], {
    psLines: ['/home/ai/.bun/bin/bun cli.ts workflow run bc-card MNC-22'],
  });

  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /still being driven/);
  assert.equal(status(r.db, CRASHED.id), 'running');
  assert.equal(r.archonArgs, '');
});

test('a run someone else is already resuming or approving is refused', () => {
  for (const verb of ['resume', 'approve']) {
    const r = run([CRASHED], ['f0136b7a'], {
      psLines: [`bun cli.ts workflow ${verb} ${CRASHED.id} "fix"`],
    });
    assert.notEqual(r.code, 0, `a live ${verb} was walked over`);
    assert.equal(status(r.db, CRASHED.id), 'running');
  }
});

test('the short id a human types is recognised in the process table too', () => {
  const r = run([CRASHED], ['f0136b7a'], {
    psLines: [`bun cli.ts workflow approve f0136b7a "abort nope"`],
  });

  assert.notEqual(r.code, 0);
  assert.equal(status(r.db, CRASHED.id), 'running');
});

test('an unrelated process does not block the revive', () => {
  const r = run([CRASHED], ['f0136b7a'], {
    psLines: ['bun cli.ts workflow run bc-card MNC-19', 'node server.js'],
  });

  assert.equal(r.code, 0);
  assert.equal(status(r.db, CRASHED.id), 'failed');
});

test('an ambiguous prefix is refused rather than guessed at', () => {
  const r = run(
    [CRASHED, { id: 'f0136b7a0000000000000000deadbeef', status: 'running', card: 'MNC-23' }],
    ['f0136b7a']
  );

  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /matches 2 runs/);
  assert.equal(status(r.db, CRASHED.id), 'running');
});

test('an unknown id is refused', () => {
  const r = run([CRASHED], ['ffffffff']);

  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /no run whose id starts with/);
});

test('--dry-run reports and writes nothing', () => {
  const r = run([CRASHED], ['f0136b7a', '--dry-run']);

  assert.equal(r.code, 0);
  assert.match(r.stdout, /leaving the row alone/);
  assert.equal(status(r.db, CRASHED.id), 'running');
  assert.equal(r.archonArgs, '');
});
