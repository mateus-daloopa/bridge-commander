#!/usr/bin/env bash
# bc-card-run.sh — start the bc-card pipeline for one card. THE start command:
#
#   bc-axi card start <CARD> --command "/home/ai/repos/bridge-commander/bin/bc-card-run.sh <CARD>"
#
# It exists for one reason, and the reason is a flag we had to stop passing.
#
# Archon locks one workflow per WORKING PATH and takes that path from the
# process cwd. Every card used to start with `bun --cwd <archon-repo>`, so every
# run in a workspace reported the same path and the second card died on arrival:
# "This worktree is in use by bc-card". Dropping the flag fixes that — the cwd
# stays the board's own per-card worktree, which is unique and already the git
# repo archon requires — and immediately trips a second thing:
#
#   Archon keeps ONE `source` symlink per workspace, points it at whichever
#   directory ran last, and REFUSES to repoint it. Two worktrees of one repo
#   therefore fight over it, and every run after the first logs
#   "Source symlink ... already points to ...".
#
# It is not fatal — the run dispatches anyway — and that is exactly why it needs
# fixing. An error that is always there and always fine is an error nobody reads
# on the day it is not fine.
#
# So: clear a STALE symlink for this repo, then hand over to archon. Nothing
# reads that link on our side; archon rebuilds it for whoever runs next.
#
# Env:
#   ARCHON_HOME   default ~/.archon
#   ARCHON_CMD    how to invoke archon (default: the bun line — `archon` is not
#                 on PATH). Word-split on purpose.
set -uo pipefail

CARD=${1:-}
[ -n "$CARD" ] || { echo "usage: bc-card-run.sh <CARD>" >&2; exit 2; }

ARCHON_HOME=${ARCHON_HOME:-$HOME/.archon}
ARCHON_CMD=${ARCHON_CMD:-/home/ai/.bun/bin/bun /home/ai/archon-eval/archon/packages/cli/src/cli.ts}

# The workspace archon will pick is derived from this repo's origin, the same
# way the workflow derives ORIGIN_REPO. No remote means no workspace to collide
# over, so there is nothing to clear.
ORIGIN=$(git remote get-url origin 2>/dev/null \
  | sed -E 's#^git@[^:]+:##; s#^https?://[^/]+/##; s#\.git$##')
if [ -n "$ORIGIN" ]; then
  LINK="$ARCHON_HOME/workspaces/$ORIGIN/source"
  if [ -L "$LINK" ]; then
    HERE=$(pwd -P)
    THERE=$(readlink "$LINK")
    # Only when it disagrees. Removing a link that is already right would be
    # churn, and churn in a shared path is how two runs start racing.
    if [ "$(readlink -f "$LINK" 2>/dev/null)" != "$HERE" ]; then
      rm -f "$LINK" && echo "cleared a stale archon source link ($THERE -> this worktree)"
    fi
  fi
fi

exec $ARCHON_CMD workflow run bc-card "$CARD"
