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
# Provides: attach, hang, mark. Checks for workflow drift on the way in.

. "${ARTIFACTS_DIR:-/nonexistent}/env.sh" 2>/dev/null || return 1

# ── workflow drift ───────────────────────────────────────────────────────────
# The same trap from the other end. A run cannot pin the file archon reads — it
# resolves `bc-card` by name, every time — so the next best thing is that a run
# which wakes into a DIFFERENT workflow says so, loudly, on the card, instead of
# behaving strangely and leaving a human to work out why. `setup` records the
# sha; every node sourcing this file checks it. Reported once per run.
if [ -n "${WORKFLOW_FILE:-}" ] && [ -n "${WORKFLOW_SHA:-}" ] \
   && [ ! -f "$ARTIFACTS_DIR/.drift-reported" ]; then
  _now=$(sha256sum "$WORKFLOW_FILE" 2>/dev/null | cut -d' ' -f1)
  if [ -n "$_now" ] && [ "$_now" != "$WORKFLOW_SHA" ]; then
    : > "$ARTIFACTS_DIR/.drift-reported"
    {
      printf '**%s — the workflow changed under this run.**\n\n' "${CARD:-?}"
      printf '`%s` is not the file this run started on.\n\n' "$WORKFLOW_FILE"
      printf '    started on  %s\n    now         %s\n\n' "$WORKFLOW_SHA" "$_now"
      echo 'Archon resolves the workflow by name on every resume, so from here the'
      echo 'run is walking through node bodies it was not planned with, against a'
      echo 'scratch directory the old ones wrote. Whatever it does next, read it'
      echo 'with that in mind — and treat a lost gate answer as explained.'
    } > "$ARTIFACTS_DIR/drift.md"
    echo "WORKFLOW DRIFT: $WORKFLOW_FILE changed since this run started"
    "$BC" event "$CARD" --level 2 --kind pipeline --actor archon \
      --workspace "$WORKSPACE" --text-file "$ARTIFACTS_DIR/drift.md" \
      </dev/null >/dev/null 2>&1 || true
  fi
fi

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

# rule <decision> — read a lieutenant's answer to a parked gate.
#
#   fix                            everything the gate offered
#   fix lint-1,lint-2              exactly these
#   fix lint-1 : re-export it      ...and what the finding got wrong
#   approve | skip                 the findings stand / the step is skipped
#   retry <what you fixed>         the gate REFUSED to start and the environment
#                                  is fixed now — run it again on the branch as
#                                  it stands, nothing to re-implement
#   go <instruction>               planning stop only: build it anyway, and here
#                                  is what to fix on the way
#   abort <reason>                 stop the run; park the card, open no PR
#
# Sets RULE_ACTION, RULE_IDS, RULE_INSTRUCTIONS, RULE_REST (everything after the
# action, whole — the abort reason). Returns 1 for an action this pipeline does
# not know, 2 for guidance handed to an action that cannot carry it: only `fix`
# reaches no-mistakes' fixer, and guidance dropped in silence is a lieutenant
# who thinks they were heard.
#
# It lives here rather than in the workflow because a grammar that can be wrong
# is a grammar that gets tested, and this file has tests.
rule() {
  RULE_ACTION=; RULE_IDS=; RULE_INSTRUCTIONS=; RULE_REST=
  read -r RULE_ACTION RULE_REST <<<"${1:-}"
  RULE_REST=${RULE_REST:-}
  case "$RULE_ACTION" in
    fix|approve|skip|abort|go|retry) ;;
    *) return 1 ;;
  esac
  # `abort`, `go` and `retry` all take free text to the end of the line — a
  # reason, an instruction, an account of what was fixed — colons and all. Only
  # the finding-shaped answers split on the colon.
  case "$RULE_ACTION" in
    abort|go|retry) return 0 ;;
  esac
  RULE_IDS=$RULE_REST
  case "$RULE_REST" in
    *:*) RULE_IDS=${RULE_REST%%:*}; RULE_INSTRUCTIONS=${RULE_REST#*:} ;;
  esac
  # Word-splitting an unquoted expansion is the trim, and it is deliberate.
  RULE_IDS=$(echo $RULE_IDS)
  RULE_INSTRUCTIONS=$(echo $RULE_INSTRUCTIONS)
  [ -z "$RULE_INSTRUCTIONS" ] || [ "$RULE_ACTION" = fix ] || return 2
  return 0
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
