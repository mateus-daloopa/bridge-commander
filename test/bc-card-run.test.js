'use strict';
// bin/bc-card-run.sh — the start command for a bc-card run.
//
// Its whole job is one pre-flight: archon keeps a single `source` symlink per
// workspace and refuses to repoint it, so two worktrees of the same repo fight
// over it and every run after the first logs an error. The error is not fatal,
// which is why it matters — an error that is always there and always fine is
// one nobody reads on the day it is not.
//
// These tests replace archon with a recorder and check the four cases: stale
// link cleared, correct link left alone, no link at all, no origin remote.
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const RUN = path.join(__dirname, '..', 'bin', 'bc-card-run.sh');

// A git repo with an origin, standing in for the board's per-card worktree.
function makeRepo(dir, origin) {
  fs.mkdirSync(dir, { recursive: true });
  const git = args => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' });
  git(['init', '-q']);
  if (origin) git(['remote', 'add', 'origin', origin]);
  return dir;
}

// run({origin, link}) -> { stdout, archonArgs, linkTarget }
// `link` is the path the workspace symlink points at before we start, or null.
function run({ origin = 'git@github.com:acme/widgets.git', link = null, cwd = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-card-run-'));
  const repo = makeRepo(path.join(dir, 'worktree'), origin);
  const home = path.join(dir, 'archon');
  const wsDir = path.join(home, 'workspaces', 'acme', 'widgets');
  fs.mkdirSync(wsDir, { recursive: true });
  const linkPath = path.join(wsDir, 'source');
  if (link) fs.symlinkSync(link === 'self' ? repo : link, linkPath);

  const archon = path.join(dir, 'archon-bin');
  const log = path.join(dir, 'archon-args');
  fs.writeFileSync(archon, `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(log)}\n`);
  fs.chmodSync(archon, 0o755);

  const stdout = execFileSync('bash', [RUN, 'MNC-1'], {
    cwd: cwd || repo,
    encoding: 'utf8',
    env: { ...process.env, ARCHON_HOME: home, ARCHON_CMD: archon },
  });

  let linkTarget = null;
  try { linkTarget = fs.readlinkSync(linkPath); } catch (e) { /* gone */ }
  return {
    stdout,
    archonArgs: fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim() : '',
    linkTarget,
    repo,
  };
}

test('a stale link pointing at another worktree is cleared', () => {
  const r = run({ link: '/somewhere/else/pipeline-lab' });

  assert.equal(r.linkTarget, null, 'the stale link survived');
  assert.match(r.stdout, /cleared a stale archon source link/);
  assert.equal(r.archonArgs, 'workflow run bc-card MNC-1', 'archon still ran');
});

test('a link that already points here is left alone — churn in a shared path is how runs race', () => {
  const r = run({ link: 'self' });

  assert.notEqual(r.linkTarget, null, 'a correct link was removed for no reason');
  assert.doesNotMatch(r.stdout, /cleared/);
  assert.equal(r.archonArgs, 'workflow run bc-card MNC-1');
});

test('no link yet is the ordinary first run — nothing to clear, nothing said', () => {
  const r = run({ link: null });

  assert.equal(r.linkTarget, null);
  assert.doesNotMatch(r.stdout, /cleared/);
  assert.equal(r.archonArgs, 'workflow run bc-card MNC-1');
});

test('no origin remote means no workspace to collide over, and archon still runs', () => {
  const r = run({ origin: null, link: '/somewhere/else' });

  assert.equal(r.linkTarget, '/somewhere/else', 'it touched a link it could not have identified');
  assert.equal(r.archonArgs, 'workflow run bc-card MNC-1');
});

test('an https remote resolves to the same workspace as the ssh one', () => {
  const r = run({ origin: 'https://github.com/acme/widgets.git', link: '/elsewhere' });

  assert.equal(r.linkTarget, null, 'the https form did not resolve to acme/widgets');
});

test('the card id is required', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-card-run-'));
  let status = 0;
  try {
    execFileSync('bash', [RUN], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    status = e.status;
  }
  assert.equal(status, 2);
});
