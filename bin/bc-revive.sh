#!/usr/bin/env python3
"""bc-revive.sh — bring a CRASHED archon run back so it can be resumed.

    bc-revive.sh <run-id-or-prefix> [--dry-run]

Archon resumes a run by replaying the DAG and skipping every node that recorded
`node_completed`. It refuses to resume anything whose status is not `failed` or
`paused` — and a run whose driving process was killed never got to write either
one. The row still says `running`, so the run is unrecoverable: `workflow
resume` bounces it, and the board's own WORKER DIED advice (`card start
--resume`) re-runs the recorded command, which starts a BRAND NEW run and
redoes the plan, the implement and the gate from zero.

This corrects the status of a run that is provably not running, and then hands
it to `workflow resume`. It is a status correction, not a rewrite: the only
column touched is `status` (and `completed_at`, which was never set), and only
after both checks below pass.

Two things must be true before anything is written:

  1. The row says `running`. A `paused` run is a human being asked, not a
     crash, and resuming it behind their back throws away the question.
  2. NOTHING is driving it. Both doors count — `workflow run <name> <card>`
     and `workflow resume|approve <run>` — because a live process writing to
     the same artifacts dir while a second one replays the DAG is worse than
     the crash.

Env:
  ARCHON_DB      the archon sqlite file (default: ~/.archon/archon.db)
  ARCHON_CMD     how to invoke archon, as a shell word list (default: the bun
                 line, since `archon` is not on PATH)
  BC_REVIVE_PS   command whose stdout is the process table to search
                 (default: `ps -eo args=`). Tests hand it a fixture.
"""
import os
import shlex
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone

DB = os.environ.get("ARCHON_DB", os.path.expanduser("~/.archon/archon.db"))
ARCHON = shlex.split(
    os.environ.get(
        "ARCHON_CMD",
        "/home/ai/.bun/bin/bun --cwd /home/ai/archon-eval/archon packages/cli/src/cli.ts",
    )
)
PS = os.environ.get("BC_REVIVE_PS", "ps -eo args=")


def die(msg, code=1):
    print(f"bc-revive: {msg}", file=sys.stderr)
    raise SystemExit(code)


def resolve(conn, prefix):
    rows = list(
        conn.execute(
            "select id, status, workflow_name, user_message from"
            " remote_agent_workflow_runs where id like ?",
            (prefix + "%",),
        )
    )
    if not rows:
        die(f"no run whose id starts with {prefix!r}")
    if len(rows) > 1:
        ids = ", ".join(r[0][:12] for r in rows)
        die(f"{prefix!r} matches {len(rows)} runs ({ids}) — give more of the id")
    return rows[0]


def driver_alive(run_id, workflow, card):
    """Is anything still driving this run? Either door counts."""
    table = subprocess.run(PS, shell=True, capture_output=True, text=True).stdout
    needles = [
        f"workflow run {workflow} {card}",
        f"workflow resume {run_id}",
        f"workflow approve {run_id}",
    ]
    # A prefix is what a human types, so match the short form too.
    needles += [f"workflow resume {run_id[:8]}", f"workflow approve {run_id[:8]}"]
    for line in table.splitlines():
        # This process is reading the table it is searching; skip our own row.
        if "bc-revive" in line:
            continue
        for n in needles:
            if n in line:
                return line.strip()
    return None


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    dry = "--dry-run" in argv
    if len(args) != 1:
        die("usage: bc-revive.sh <run-id-or-prefix> [--dry-run]", 2)

    conn = sqlite3.connect(DB)
    run_id, status, workflow, card = resolve(conn, args[0])

    if status == "paused":
        die(
            f"run {run_id[:8]} is PAUSED, not crashed — a human is being asked.\n"
            f"            answer it instead: archon workflow approve {run_id} \"<decision>\""
        )
    if status != "running":
        die(f"run {run_id[:8]} is {status!r}; only a stuck 'running' run needs reviving")

    alive = driver_alive(run_id, workflow, card)
    if alive:
        die(
            f"run {run_id[:8]} is still being driven — nothing to revive:\n"
            f"            {alive[:160]}"
        )

    print(f"run {run_id[:8]} ({workflow} {card}): status 'running', no process driving it")
    if dry:
        print("--dry-run: leaving the row alone")
        return 0

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    with conn:
        conn.execute(
            "update remote_agent_workflow_runs set status = 'failed',"
            " completed_at = coalesce(completed_at, ?) where id = ?",
            (now, run_id),
        )
    conn.close()
    print("marked failed — which it is; resuming")

    return subprocess.call([*ARCHON, "workflow", "resume", run_id])


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
