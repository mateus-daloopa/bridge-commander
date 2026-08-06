#!/usr/bin/env bash
# bc-run.sh — the two verbs every bc-card bash node needs. SOURCED, not run:
#
#   . /home/ai/repos/bridge-commander/bin/bc-run.sh || { …no env.sh… }
#
# It lives in this repo and is sourced by ABSOLUTE PATH, the same contract
# nm-clerk.sh has, and that is the point. It was briefly written into
# $ARTIFACTS_DIR by the pipeline's own `setup` node, which is a trap with teeth:
#
#   A RESUMED archon run RE-READS the workflow file and SKIPS every node that
#   already completed.
#
# So a run paused on its gate at 12:58, resumed at 12:59 after the workflow file
# changed, came back into NEW node bodies with an OLD scratch directory — and
# `setup`, the only writer of the file they wanted, was skipped as
# already-done. Every node fell into its "setup never finished" guard and the
# run swallowed the human's decision. A file in the repo cannot be skipped.
#
# What still comes from the run's scratch is env.sh — values, not code. That one
# is safe: `setup` wrote it on the first pass and it is on disk when the run
# comes back.
#
# Requires: ARTIFACTS_DIR, and $ARTIFACTS_DIR/env.sh.
# Provides: attach, hang, mark.

. "${ARTIFACTS_DIR:-/nonexistent}/env.sh" 2>/dev/null || return 1

# attach <ABSOLUTE-path> <label> — put a file on the card, now rather than at
# the end of the run. Absolute, always: the board resolves a relative uri with
# path.resolve against the SERVER's cwd and quietly points the card at a file
# that does not exist. Idempotent by uri.
attach() {
  "$BC" card artifact add "$CARD" --uri "$1" --label "$2" \
    --workspace "$WORKSPACE" </dev/null >/dev/null 2>&1 \
    && echo "artifact: $(basename "$1") — $2" \
    || echo "artifact: $1 kept on disk (the board refused it)"
}

# hang <file-under-ARTIFACTS_DIR> <label> — copy it where the board can serve
# it, then attach. Calling it again on a file that grew refreshes the copy
# without adding a second entry.
hang() {
  [ -s "$ARTIFACTS_DIR/$1" ] || return 0
  mkdir -p "$REPORTS"
  cp "$ARTIFACTS_DIR/$1" "$REPORTS/$1" 2>/dev/null || return 0
  attach "$REPORTS/$1" "$2"
}

# mark <stage> — a row on timings.md and a milestone to the board, at every node
# boundary. Two problems, one line:
#   * timings.md used to be written at the END, so a run that died said nothing
#     about where its time went. It lives under $REPORTS and is appended to as
#     the run goes, under the artifact hung in setup.
#   * a `--command` worker emits no milestones of its own, so EVERY run tripped
#     WORKER STALLED at thirty minutes. `worker signal` is the board's own door
#     for that, and it resets the stale clock.
# The gap measured is from the previous mark, so it covers the agent nodes in
# between — which is where the time actually goes.
mark() {
  _t=$(date +%s)
  _p=$(cat "$ARTIFACTS_DIR/.mark" 2>/dev/null || echo "$_t")
  printf '%s' "$_t" > "$ARTIFACTS_DIR/.mark"
  _d=$(( _t - _p ))
  mkdir -p "$REPORTS"
  printf '| `%s` | %s | %d |\n' "$1" "$(date -u +%H:%M:%S)" "$_d" >> "$REPORTS/timings.md"
  "$BC" worker signal "$CARD" "$1 — ${_d}s" --workspace "$WORKSPACE" \
    </dev/null >/dev/null 2>&1 || true
  echo "mark: $1 (+${_d}s)"
}
