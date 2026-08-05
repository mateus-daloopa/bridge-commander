#!/usr/bin/env bash
# nm-clerk.sh — drive `no-mistakes axi` through its gates with no model in the loop.
#
#   nm-clerk.sh --intent-file <file> [extra axi run flags...]   start a run
#   nm-clerk.sh --respond <fix|approve|skip> [--findings id,id] answer a parked gate
#
# The gate is a mapping, not a judgement: `auto-fix` findings get fixed, a gate
# with nothing actionable left gets approved, and an `ask-user` finding stops the
# clerk — that call belongs to a human.
#
# `--respond` is that human coming back. It answers the gate the LAST invocation
# refused — the run is still alive and still parked on it — and then drives the
# rest exactly as the first entry point does, to the same files. So one card can
# go run → park → human → outcome without anyone finishing it by hand.
#
# ALWAYS EXITS 0. This runs as a bash node inside an Archon `loop_group`, where a
# non-zero exit kills the whole run and a crashed run looks exactly like a broken
# one. So the outcome travels in files:
#
#   $ARTIFACTS_DIR/nm-outcome     passed | escalated | failed
#   $ARTIFACTS_DIR/escalation.md  the whole payload, when a finding is ask-user
#
# and the reason it stopped goes to stdout, which is the node's output and the
# next round's only account of what happened.
#
# Env:
#   NM_BIN              the no-mistakes binary (default: no-mistakes)
#   NM_MAX_FIX_ROUNDS   fix rounds before giving up (default: 3). The fixer can
#                       introduce findings of its own — it has committed
#                       __pycache__ — so an unbounded fix loop is a real shape.
#   NM_MAX_GATES        total gates answered before giving up (default: 20)
#   ARTIFACTS_DIR       where the outcome files go (default: .)
#   NM_CLERK_LOG        where no-mistakes' stderr goes (default: /dev/stderr)
set -uo pipefail

NM=${NM_BIN:-no-mistakes}
MAX_FIX_ROUNDS=${NM_MAX_FIX_ROUNDS:-3}
MAX_GATES=${NM_MAX_GATES:-20}
ART=${ARTIFACTS_DIR:-.}
LOG=${NM_CLERK_LOG:-/dev/stderr}

INTENT_FILE=
RESPOND=
FINDINGS=
while [ $# -gt 0 ]; do
  case "$1" in
    --intent-file) INTENT_FILE=${2:-}; shift 2 ;;
    --intent-file=*) INTENT_FILE=${1#*=}; shift ;;
    --respond) RESPOND=${2:-}; shift 2 ;;
    --respond=*) RESPOND=${1#*=}; shift ;;
    --findings) FINDINGS=${2:-}; shift 2 ;;
    --findings=*) FINDINGS=${1#*=}; shift ;;
    *) break ;;
  esac
done

mkdir -p "$ART"

# finish <outcome> <reason>
finish() {
  printf '%s\n' "$1" > "$ART/nm-outcome"
  printf 'clerk: %s\n' "$2"
  exit 0
}

if [ -n "$RESPOND" ]; then
  case "$RESPOND" in
    fix|approve|skip) ;;
    *) finish failed "--respond takes fix, approve or skip — not '$RESPOND'" ;;
  esac
  [ -z "$INTENT_FILE" ] \
    || finish failed "--respond answers a gate that is already open; --intent-file starts a new run. Pick one."
else
  [ -n "$INTENT_FILE" ] && [ -r "$INTENT_FILE" ] \
    || finish failed "usage: nm-clerk.sh --intent-file <readable file> [axi run flags...] | --respond <fix|approve|skip> [--findings id,id]"
fi

# Pull `<id>\t<action>` out of the TOON tabular block `findings[N]{cols}:`.
# The COLUMNS ARE READ FROM THE HEADER, never assumed by position: a reordered
# or extended header must not silently shift `action` onto another field.
# Fields are comma-separated with optional double quotes and backslash escapes;
# descriptions carry both, so the split has to respect them.
parse_findings() {
  awk '
    function splitrow(line, out,   i, c, f, inq, nf) {
      delete out; nf = 0; f = ""; inq = 0
      for (i = 1; i <= length(line); i++) {
        c = substr(line, i, 1)
        if (c == "\\" && inq) { i++; f = f substr(line, i, 1); continue }
        if (c == "\"") { inq = !inq; continue }
        if (c == "," && !inq) { out[++nf] = f; f = ""; continue }
        f = f c
      }
      out[++nf] = f
      return nf
    }
    /^ *findings\[[0-9]+\]\{/ {
      hdr = $0; sub(/^[^{]*\{/, "", hdr); sub(/\}.*$/, "", hdr)
      n = split(hdr, col, ",")
      idc = 0; ac = 0
      for (i = 1; i <= n; i++) { if (col[i] == "id") idc = i; if (col[i] == "action") ac = i }
      if (!idc || !ac) { print "PARSE_ERROR no id/action column in header: " hdr; exit }
      match($0, /^ */); hdrind = RLENGTH; inblk = 1; next
    }
    inblk {
      match($0, /^ */); ind = RLENGTH
      line = $0; sub(/^ +/, "", line)
      if (ind <= hdrind || line == "") { inblk = 0; next }
      if (splitrow(line, F) < n) { print "PARSE_ERROR short row: " line; exit }
      print F[idc] "\t" F[ac]
    }
  '
}

# The first `status:` inside the `gate:` block — not the `run:` one above it.
gate_status() {
  awk '/^gate:/ { g = 1; next }
       g && /^[^[:space:]]/ { g = 0 }
       g && $1 == "status:" { print $2; exit }'
}

fix_rounds=0
gates=0

# The two doors into the same loop. `--respond` skips `axi run` because the run
# is already open and parked; the human's decision IS the first gate answer, and
# everything after it is the clerk's ordinary job again.
if [ -n "$RESPOND" ]; then
  printf 'clerk: answering the parked gate — %s%s\n' "$RESPOND" "${FINDINGS:+ ($FINDINGS)}"
  if [ "$RESPOND" = fix ] && [ -n "$FINDINGS" ]; then
    out=$("$NM" axi respond --action fix --findings "$FINDINGS" 2>>"$LOG")
  else
    out=$("$NM" axi respond --action "$RESPOND" 2>>"$LOG")
  fi
else
  out=$("$NM" axi run --intent "$(cat "$INTENT_FILE")" "$@" 2>>"$LOG")
fi

while :; do
  printf '\n===== gate %d =====\n%s\n' "$((gates + 1))" "$out"

  if grep -q '^outcome:' <<<"$out"; then
    o=$(sed -n 's/^outcome:[[:space:]]*//p' <<<"$out" | head -1)
    case "$o" in
      passed|checks-passed) finish passed "no-mistakes finished: $o" ;;
      *)                    finish failed "no-mistakes finished: $o" ;;
    esac
  fi

  if grep -q '^error:' <<<"$out"; then
    finish failed "no-mistakes refused to run: $(sed -n 's/^error:[[:space:]]*//p' <<<"$out" | head -1)"
  fi

  grep -q '^gate:' <<<"$out" \
    || finish failed "unrecognised no-mistakes output: no gate:, outcome: or error: line"

  gates=$((gates + 1))
  [ "$gates" -gt "$MAX_GATES" ] \
    && finish failed "gate cap ($MAX_GATES) reached — no-mistakes is not converging"

  # `awaiting_approval` and `fix_review` carry an identically shaped findings
  # table and mean different things: the first is "rule on these", the second is
  # "here is what my fixer did, and what it introduced". Both are answered by the
  # same mapping, but only fix_review can loop, so both are named rather than
  # defaulted — an unrecognised status is a shape we have not seen, and guessing
  # at it is how a clerk ships something nobody agreed to.
  status=$(gate_status <<<"$out")
  case "$status" in
    awaiting_approval|fix_review) ;;
    *) finish failed "unknown gate status: ${status:-<none>} — refusing to guess at it" ;;
  esac

  rows=$(parse_findings <<<"$out")
  case "$rows" in PARSE_ERROR*) finish failed "$rows" ;; esac

  ask=$(awk -F'\t' '$2 == "ask-user" { print $1 }' <<<"$rows" | paste -sd,)
  if [ -n "$ask" ]; then
    {
      echo "# no-mistakes parked on an ask-user finding"
      echo
      echo "Gate \`$status\` on step \`$(sed -n 's/^ *step:[[:space:]]*//p' <<<"$out" | head -1)\`."
      echo "Findings the clerk refused to resolve: \`$ask\`."
      echo
      echo "An \`ask-user\` finding challenges deliberate intent or touches product"
      echo "behaviour. Nothing was resolved and nothing was approved."
      echo
      echo '```'
      printf '%s\n' "$out"
      echo '```'
    } > "$ART/escalation.md"
    finish escalated "ask-user finding(s) at gate $status: $ask — parked, nothing resolved"
  fi

  fix=$(awk -F'\t' '$2 == "auto-fix" { print $1 }' <<<"$rows" | paste -sd,)
  if [ -n "$fix" ]; then
    fix_rounds=$((fix_rounds + 1))
    [ "$fix_rounds" -gt "$MAX_FIX_ROUNDS" ] && finish failed \
      "fix-round cap ($MAX_FIX_ROUNDS) reached at gate $status; the fixer is still producing findings: $fix"
    printf 'clerk: fix round %d — %s\n' "$fix_rounds" "$fix"
    out=$("$NM" axi respond --action fix --findings "$fix" 2>>"$LOG")
  else
    printf 'clerk: approve — nothing actionable at gate %s\n' "$status"
    out=$("$NM" axi respond --action approve 2>>"$LOG")
  fi
done
