#!/usr/bin/env python3
"""bc-card-live.sh — which bc-card runs are ACTUALLY in flight.

    bc-card-live.sh            # print the live ones; exit 0 if none, 1 if any
    bc-card-live.sh --prune    # ...and drop the dead lines from the ticket

`setup` appends a line to `~/.archon/workflows/.bc-card.live` and `cleanup`
takes it out again. That works right up until a run does not reach `cleanup` —
a killed driver, a crashed worker — and then the line stays forever and the
ticket says the workflow is busy for the rest of time.

It said exactly that for two hours after CMD-1's worker died, and I believed it
instead of checking. So: the run id is on every line, and this asks archon's own
database what became of that run. A run is live only if its row says `running`
or `paused` AND something is still driving it or a human is being asked. Anything
completed, failed, cancelled, or simply absent is dead and gets pruned.

`paused` is the interesting case and it is deliberately kept: a paused run holds
no process — that is the whole design of the gate — so "no process" cannot mean
"dead" for it. A paused run is a human being asked, and editing the workflow it
will wake into is precisely the thing the ticket exists to prevent.

Env:
  ARCHON_DB      the archon sqlite file (default: ~/.archon/archon.db)
  BC_LIVE_FILE   the ticket (default: ~/.archon/workflows/.bc-card.live)
"""
import os
import sqlite3
import sys

DB = os.environ.get("ARCHON_DB", os.path.expanduser("~/.archon/archon.db"))
TICKET = os.environ.get(
    "BC_LIVE_FILE", os.path.expanduser("~/.archon/workflows/.bc-card.live")
)
ALIVE = ("running", "pending", "paused")


def read_ticket():
    try:
        with open(TICKET) as fh:
            return [ln.rstrip("\n") for ln in fh if ln.strip()]
    except FileNotFoundError:
        return []


def status_of(conn, run_id):
    """The run's status, or None when archon has never heard of it."""
    row = conn.execute(
        "select status from remote_agent_workflow_runs where id = ?", (run_id,)
    ).fetchone()
    return row[0] if row else None


def main(argv):
    prune = "--prune" in argv
    lines = read_ticket()
    if not lines:
        return 0

    try:
        conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    except sqlite3.Error as e:
        # Cannot check, so cannot prune. Report everything as live and say why:
        # a broken check must never be the reason a live workflow gets edited.
        print(f"cannot read archon's database ({e}) — treating all {len(lines)} as live",
              file=sys.stderr)
        for ln in lines:
            print(ln)
        return 1

    live, dead = [], []
    for ln in lines:
        parts = ln.split("\t")
        run = parts[0] if parts else ""
        st = status_of(conn, run)
        (live if st in ALIVE else dead).append((ln, st))

    for ln, st in live:
        print(f"{ln}\t{st}")
    for ln, st in dead:
        print(f"dead: {ln.split(chr(9))[0][:8]} ({st or 'unknown to archon'})", file=sys.stderr)

    if prune and dead:
        keep = [ln for ln, _ in live]
        if keep:
            with open(TICKET, "w") as fh:
                fh.write("\n".join(keep) + "\n")
        else:
            os.remove(TICKET)
        print(f"pruned {len(dead)} dead line(s)", file=sys.stderr)

    return 1 if live else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
