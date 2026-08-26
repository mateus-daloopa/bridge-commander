# Where today's implementation cards lost their time — 2026-08-26

All timestamps UTC. `E:` = `.bridge-commander/board.json` card `events[]` (filtered dump with the
line numbers used below: `slow-cards-2026-08-26-evidence/board-events.txt`), `T:` = worker
session transcript line, `NM` = `~/.no-mistakes/state.sqlite` (`runs`/`step_results`/
`step_rounds`/`agent_invocations`), `Q:` = `queue/<lt>.jsonl`, `H:` = `hookruns.jsonl`, `C:` = `chat/<lt>.jsonl` (today's lines of
each, plus the NM run/step/round summary, are in `slow-cards-2026-08-26-evidence/`).

Cards with worker activity today: MNC-111, CMD-25, CMD-26, LEN-19, LEN-25, LEN-26,
LEN-27, WAL-23 (confirmed from `board.json` + `archive.jsonl` `ts` fields; the other cards
with events today — SLM-26/27, CMD-27/28/29, LEN-24/28/29/30, MNC-112 — are
created/backlog only). Two of the eight (CMD-25 tail, LEN-19) started on 08-25; their
08-25 minutes are called out separately.

Transcripts:
- MNC-111 `~/.claude/projects/-home-ai-repos-roboflow-commander--bridge-commander-worktrees-MNC-111/1a0695f6-91bc-4764-8acd-14cc9f7a659f.jsonl`
- CMD-25 `~/.claude/projects/-home-ai--treehouse-roboflow-0fcf17-11-roboflow/a95212a3-fca6-42d2-989c-f921cadc9835.jsonl`
- CMD-26 `~/.claude/projects/-home-ai--treehouse-roboflow-0fcf17-10-roboflow/6648ce28-f516-4c2a-8ff3-84611b817fb3.jsonl`
- LEN-19 `~/.claude/projects/-home-ai--treehouse-roboflow-0fcf17-8-roboflow/48f8a160-2782-48f3-82e6-31fcbd997859.jsonl`
- LEN-25 `~/.claude/projects/-home-ai--treehouse-roboflow-0fcf17-11-roboflow/a21d471d-31ef-4a44-9477-3a195b3b5fc6.jsonl`
- LEN-26 `~/.claude/projects/-home-ai--treehouse-roboflow-0fcf17-8-roboflow/30e6dfc8-e52e-4be6-ab8c-f51f712453e5.jsonl`
- LEN-27 `~/.claude/projects/-home-ai--treehouse-roboflow-0fcf17-11-roboflow/f69d8a5d-93b6-484b-aeaf-664b644a3f00.jsonl`
- WAL-23 `~/.codex/sessions/2026/08/26/rollout-2026-08-26T15-24-46-01a03f51-4812-7693-a5d3-d3b34ff5ef25.jsonl` (+3 subagent rollouts `01a03f52-*`)

## 1. One row per card

"Start" = `started` event, "handoff" = `handoff` (Working → Your review) event. "Active" =
minutes a worker tool was executing in the foreground (tests, builds, git, edits).
"Waiting" = blocked on the no-mistakes daemon, on a lieutenant/captain ruling, or idle at
its prompt. Restarts = `worker-died`/`resumed` events. Gate rounds = no-mistakes review
rounds (review + fix_review) across all runs on the branch.

| card | playbook | start → handoff (wall) | active / waiting min | restarts | gate rounds (runs) | test runs (count · scope · min) | captain pushes |
|---|---|---|---|---|---|---|---|
| MNC-111 | no-mistakes | 17:49:07 (E:119) → 18:37:17 (E:129) · **48 min** | 8 / 40 (20 nm-blocked T:271/277/291, 20 turn-ended idle T:352→353, T:408→414) | 0 | 3 review + 1 doc gate (1 run `01M0ZKBD`) | worker 3 · targeted `test/workers.test.js` · 0.7; NM test step 17.1 (full 1039-test suite 5.2 + **5.4 self-blocked** `pgrep` loop) | 2 (E:131 18:24 `status?`, E:133 21:50 merge?) |
| CMD-25 | draft-first-roboflow | 08-25 22:00:59 (E:398) → 08-26 00:42:30 (E:452) · **161 min** | 11 / 119 (nm-blocked 88.3; **true stall 30.9** T:1403→1407) | 0 | r1 + 3 fix rounds, 6 ask-user (3 runs `01M0XJ78`, `01M0XPMM` + one at 22:19) | 15 · all targeted (`zipUpload.test.ts`, `uploadAnnotation`, `test/imageUpload/`) · 4.9 | 5 in-run (E:457/459/463 chip ×3, E:465 playbook?, E:467 `Segue`) + 9 today on the closed PR (E:469–485; closed 16:32 as wrong solution) |
| CMD-26 | draft-first-roboflow | 16:46:38 (E:56) → 21:23:56 (E:73) · **277 min** | 6 / 271 (nm-blocked 33.6; lieutenant/captain 11; **worker idle at prompt 211.8** T:770→772, T:864→866) | 0 | r1–r3 + test gate + doc gate (1 run `01M0ZGGT`, doc step parked **220.8 min** NM `parked_ms`) | 9 · targeted · 2.6 (7 of them throwaway `vocProbe`/`cocoProbe`) | 4 (E:88 17:22, C:13 18:23, E:90 20:18 "passou o dia inteiro", E:92 21:12 "não rodou nem o No Mistakes?") + 3 scope pushes before start (E:79, C:8, C:11) |
| LEN-19 | no-mistakes-roboflow | 08-25 15:18:16 (E:145) → 08-26 14:10:09 (E:270) · **1372 min** (today: 00:00→14:10 = 850) | today 41 / 809 (tsc isolation 33 [00:00–00:33]; CI 6.5; **758 overnight gap** T:2051→2053; 50 turn-ended waits 13:16→13:26, 13:41→13:58) | 4 resumes today (E:224, 231, 240, 264) + 3 parks | none today (captain forbade no-mistakes E:164); CI reruns: 3 on 08-25 + 1 today (E:242–248) | 43 full `tsc --noEmit --incremental` compiles ≈ 61 min compile (20 on 08-25 T:1238–1317; 49 across 23:25–00:33 T:1707–2022, ~33 of it today) | 7 today (E:336 12:02, E:338 13:10 502, E:346 13:26 conflict, E:350/352 13:56 heap, C:29 14:04 bloated, E:356/358 guide) |
| LEN-25 | no-mistakes-roboflow | 01:32:39 (E:362) → **never**; parked+archived 14:59:31 (E:381) · **807 min** | 90 / 671 (ask-user parks **530.9** [496.6 overnight T:1261→1262]; nm rounds/gates 127.8; eslint bg 8.4; feedback-prompt stall 3.6) | 0 resumes; 3 nm runs: `01M0XX45` crashed ARG_MAX, `01M0Z0Q1` **superseded after 28/28 green**, `01M0Z3TK` unfinished | 8 review rounds (3+3+2), 4 ask-user parks | jest 2 · targeted · 1.3; tsc/measure 37 fg calls 14.5; eslint full-app 5 runs ≈ 13 (one 10.2-min `eslint .` **failed**); coverage guard ×8 2.6 | 5 (E:383 12:02 chip, E:386 13:10, E:389 13:14 "parece que ele está parado", E:391 13:26 chip, E:393 13:33 "Coloca direito essa merda") |
| LEN-26 | draft-first-roboflow | 15:15:12 (E:3) → 18:53:12 (E:38) · **218 min** | 62 / 156 (nm-blocked/polled 72.3; captain checkpoint 13.6; test-wait 29.7 fg [+38.7 bg]; death+hand-rebase ≈ 9) | **1** (died 16:52:59 E:17, resumed 16:53:16 E:18) | 7 review rounds over **4 runs, 3 cancelled "superseded by new push"** (NM `01M0ZF3Y`, `01M0ZHAE`, `01M0ZM1A`, `01M0ZM45`) | 12 · 4 full (host Functions Jest **38.7 min, 953 failed — no Pub/Sub emulator** T:803/881; app unit ×3 ≈ 5) + 8 targeted · 30 fg | 6 (E:42 15:30 chip, E:46 16:32, C:36 16:47 "Por que que isso aqui tá demorando?", E:48 17:00, E:50 17:13 conflict, E:52 18:23 "Qual a demora?") |
| LEN-27 | draft-first-roboflow | 17:01:55 (E:97) → 18:09:41 (E:107) · **68 min** | 12 / 39 (nm-blocked 30.5; checkpoint idle 8.8) | 0 | r1–r2, 1 ask-user (1 run `01M0ZHX9`); NM test 12.4, CI monitor 10.8 | 8 · 7 targeted + 1 full `test/services/` · 2.4 (4 reruns of one new file: 2 env failures) + devcontainer `npm ci` repair **6.2** | 2 (E:112 17:12 chip, E:115 17:20 bloated PR) |
| WAL-23 | codereview (codex) | 18:24:47 (E:137) → 18:34:28 (E:142) · **9.7 min** | 7.6 / 2.1 (handoff lag) | 0 | n/a — 3 parallel subagents, longest 4m43s | 0 | 0 |

Day totals across the 8 cards: **~1,170 min of worker wall time on cards that reached a
gate or handoff**, of which **~180 min was foreground tool execution**. The rest is
waiting — on the no-mistakes daemon (≈ 370 min blocked), on a worker that had gone quiet
at its prompt (≈ 245 min), on rulings that needed the captain (≈ 560 min, 497 of it
overnight), and on discarded pipeline work (≈ 90 min).

## 2. Per card — the three biggest sinks

### MNC-111 (48 min, 8 active)
1. **NM test step 17.1 min for a 44-test change** — NM `step_results` test `dur=17.1m`
   18:08:23→18:25:29. The test agent ran the full suite (`node --test … test/*.test.js
   harness/test/*.test.js`, 1039 tests, 5.2 min, its transcript L223) and then blocked
   5.4 min on `until ! pgrep -f "node --test --test-concurrency=1 test/" …; sleep 10`
   (L272 18:13:54 → L274 18:23:54, 600 s timeout) — the `pgrep -f` pattern matches its own
   loop, so it never exits; the suite had finished at 18:18:27.
2. **Blocking on `no-mistakes axi respond` past the 600 s Bash timeout** — T:291 18:04:56
   `no-mistakes axi respond --action fix --findings shared-bc-base-ref-race,…` hit the
   timeout at 18:14:56, backgrounded, real exit 18:27:34 (22.6 min). Turn ended 18:15:11 with
   the shell in background → `worker-stopped` E:121 18:15:10, lieutenant poke E:122.
3. **Review 13.1 min in 3 rounds** — NM `review` 17:54:45→18:08:23: r1 4.7 + fix 3.2 +
   r2 1.7 + fix 2.4 + r3 1.0. All auto-fix, none needed a human.

### CMD-25 (161 min, 11 active; ran 08-25 22:00 → 08-26 00:42)
1. **no-mistakes rounds 88.3 min blocked** — 7 background waits: run#1 5.1 (T:867→946),
   fix r1 10.3 (T:992→1048), approve→push 11.6 (T:1096→1134, push step **failed** because
   the pipeline's rebase dropped changes), run#2 5.0, fix r2 5.4, fix r3 **26.5** (T:1580→
   1603), run#3+CI 24.4 (T:1704→1717).
2. **30.9-min unforced stall** — T:1403 23:03:25 "Recovered the untruncated text from the
   pipeline's state DB…" → nothing → T:1407 23:34:19 lieutenant "Status check: you have
   been quiet for 30 minutes". Worker at T:1421: *"no shell was running — I stalled after
   recovering finding [2]'s text and did not start the work."* Board E:433 `worker-stalled`
   fired at 23:33:52 — the 30-min watchdog was the only thing that woke it.
3. **Pipeline archaeology instead of work** — T:1142–1247 22:50–22:53 (13 calls, 3.6 min,
   incl. a 2.0-min hung `git fetch -q origin`) hunting the gate's commit `b5163934` across
   `~/.no-mistakes/worktrees/*`; T:1376–1393 + T:1483 reading `~/.no-mistakes/state.sqlite`
   because `no-mistakes axi status` truncates finding text at 668 chars (worker signal
   E:440: *"Recovered from the pipeline state DB because the CLI cuts it at 668 chars"*).
   T:1493–1497 `git checkout nm-cmd25-fix2` left the worktree on the wrong branch → next
   `respond` bounced "no active run" (T:1570–1576).

### CMD-26 (277 min, 6 active)
1. **211.8 min idle at the prompt after ending a turn with no signal and no gate response.**
   T:768 17:38:33 final text *"Document gate is parked — one ask-user… Say the word and I'll
   respond to the gate"* — reported in chat text, never `bc-axi worker signal`. Turn-end
   posted (`harness/…w-CMD-26.turnend.jsonl` line 4, 17:38:33) but **no board event**: the
   `stopNotified` flag set at 17:32:08 (E:65) was still up, so `server/server.js:4262-4270`
   suppressed it. `worker-stalled` fired once at 18:08:59 (E:67); lieutenant re-sent at
   18:09:27 (E:68); worker answered the four VOC questions and ended its turn at 18:11:32
   with *"Now finishing the gate."* (T:862) — again no signal, no `respond`. The
   `staleNotified` flag stays set (only cleared by signal/done/resume — `server.js:2763-2769`,
   `:2848-2852`; a turn-end does **not** clear it, contradicting the comment at `:3091`), so
   **3 h 01 m of silence produced zero further board events**. NM run `01M0ZGGT` document
   step `parked_ms=220.8m` (17:32:48→21:12:45). Lieutenant told the captain "Ready for you"
   at 20:19 (E:91) without checking; captain caught it at 21:12 (E:92).
2. **VOC/COCO probe rabbit hole** — T:571–764 17:32:55→17:38:09 (35 calls) and T:776–858
   18:09:46→18:11:11 (18 calls): wrote `test/bulkUpload/vocProbe.test.ts` (T:695) and
   `cocoProbe.test.ts` (T:828), 7 `itest` runs (1.6 min). Trigger was the lieutenant's own
   side question in E:66 ("*Separately, and I need this for something outside your card: tell
   me exactly what you tested… If your evidence covers VOC…*") and the brief's wrong
   acceptance line `Set: annotations replaced, empty list clears them`
   (`harness/…w-CMD-26.prompt` §Acceptance) which the test gate refuted (E:64 17:31:54).
3. **Test step 18.1 min + doc gate on a docs-only finding** — NM test `dur=18.1m`
   17:13:08→17:32:48 (integration suites in the devcontainer), then document step parked on
   `document-1` (CLAUDE.md doc rot, `info`) which needed a human to say "leave it".

### LEN-19 (today: 850 min wall, 41 active; 758 overnight)
1. **CI cache pollution → 69 min of local tsc isolation + 5 CI reruns.** App typecheck
   OOMs at 8 GiB because `.github/workflows/typecheck.yaml` `restore-keys:
   tsbuildinfo-app-v1-` shares one `app.tsbuildinfo` pool across PRs (E:210, E:213). First
   isolation (T:1238–1317, 08-25 19:31–19:51, 6 compiles) compared the wrong tree
   (merge-base vs head) and was rejected by the captain (E:206 23:20:53); redo T:1707–2022
   23:25→00:32 ran **37 full compiles + 5 `--listFiles`** (cross-seed experiments A–N,
   ~85 s each). Today: run 32974180556 failed twice (E:238/239 13:33, E:252/253 13:43),
   fixed by the captain-ordered 12 GB step heap (E:256–259, green 14:03).
2. **Supervision by foreground `sleep` loops** — 30+ Bash calls of 6–10 min each
   (`END=$((SECONDS+540)); while …curl https://localhost.roboflow.one/…`, e.g. T:1411
   21:32:09 9.9 min) ≈ 172 min on 08-25 evening; captain's 23:20 rejection sat queued
   inside one of them 3.7 min (T:1670→1677). Overnight `Monitor` at 300 s missed the 13:11
   outage entirely (signal E:222: last sample "three seconds before the crash").
3. **Turn-ended waits on the captain today** — 13:16:57→13:26:39 (conflict resolution on
   GitHub, E:227→232), 13:41:34→13:58:05 (heap ruling, E:250→256): 26 min, plus 3 park/
   resume cycles (E:229–231, 236–240, 247–255) each costing a lieutenant turn.

### LEN-25 (807 min, never handed off, 90 active)
1. **496.6-min ask-user park, invisible to the board.** T:1261 03:46:41 the worker used
   Claude's `AskUserQuestion` tool ("declaration-level hoist you ordered is measurably
   insufficient…") instead of `bc-axi worker signal`; nobody on the board saw a question
   until the captain asked "cade o chip do pr aqui?" at 12:02 (E:383) and the lieutenant
   ruled at 12:03:19 (E:372). The first ruling at 02:44 had also taken 30 min the same way
   (T:1073 `AskUserQuestion` 02:14:27 → rejected 02:44:26). NM run `01M0XX45`
   `parked_ms=540.6m`.
2. **ARG_MAX crash then a green run thrown away.** Resuming at 12:04 failed: NM
   `runs.error` = `step review failed: agent fix: claude start: fork/exec
   /home/ai/.local/bin/claude: argument list too long` (worker T:1297: "*the instructions had
   grown to ~7KB across three rounds*" — `--instructions` accumulates into argv).
   Run 2 `01M0Z0Q1` then reached **28/28 CI green at ~13:21** (T:2190); the worker committed
   a wording fix to `scripts/check-typecheck-coverage.sh` (T:2214 13:23:00) and started run 3
   (T:2218 13:23:14) → run 2 `cancelled: superseded by new push`; run 3 review 7.2 +
   fix 32.2 min never reached test before the captain archived the card at 14:59.
3. **Proof runs off the brief** — eslint whole-app parity (T:1686 `eslint . --format unix`
   10.2 min, **failed**; 4 more full-src eslint runs ≈ 6 min), prod+tests tsc memory pair
   measured 5 separate times (01:55, 03:40, 12:08, 12:15, 14:12), coverage guard ×8; plus 9×
   `no-mistakes axi status` in 20 s (T:890–945) and 4 concurrent waiter shells that
   triggered `worker-stopped` E:366 02:07:52 "with four no-mistakes shells still running".

### LEN-26 (218 min, 62 active)
1. **Branch cut on a stale base, then three pipeline runs discarded.** T:52 15:15:28
   `git checkout -b bc/LEN-26` with **no fetch**; first `git fetch origin master` at T:1418
   16:39:37: `behind origin/master: 7` (incl. `#14673` LEN-19 which touched the same
   `packages/shared/package.json`). Draft PR #14748 opened on that base → GitHub conflict
   (captain E:50 17:13). NM run 1 `01M0ZF3Y` rebase gate 2.2 min + hand-resolved rebase
   (T:1551–1593); session **died** at T:1504 16:52:43 25 s after the review result; worker
   then `git push --force no-mistakes` (T:1992 17:19:08) → run 1 cancelled with its 6 review
   findings never answered; run 2 `01M0ZHAE` finished review (22.2) + test (11.1) and was
   parked at document when the worker force-pushed again (T:2722 18:06:34) → cancelled; run
   3 `01M0ZM1A` cancelled 90 s later by a rebase push (T:2773). **≈ 42 min of pipeline work
   thrown away**, final run `01M0ZM45` 18:08→18:41 + CI.
2. **38.7-min host Functions Jest run that could not pass** — T:803 15:45:33 `timeout 3000
   npx jest test/ --silent --logHeapUsage` on the host: `953 failed, 3 skipped, 74 passed`
   (T:881), root errors `Cannot find module 'common-tags'` / Pub/Sub emulator absent; worker
   blocked on it with three 10-min `TaskOutput` waits (T:834/851/880). Lieutenant's Phase 2
   order (E:12 15:34:47 "*Prove the packed package through Funct…*") asked for proof, not a
   full suite; the playbook never says "devcontainer" (captain C:39). Plus app unit suite run
   3× (T:846 polluted by `functions/dist` leftovers, T:874, T:950) and universe webpack
   11.5 min rc=1 on root-owned `critical.css` (T:781/818).
3. **Ruling latency inside the gate** — ruling #1 queued 17:23:05 (E:25) reached the worker
   at 17:29:33 (it was inside a 10-min `sleep 20` poll loop T:2013), first edit T:2221
   17:42:58 = **20 min**; ruling #2 17:31:50 → first edit 17:44:28 = 13 min. Five
   no-mistakes poll loops of 8–10 min each after 18:08 (T:2779, 2842, 2861, 2904).

### LEN-27 (68 min, 12 active)
1. **no-mistakes blocked 30.5 min** — T:676 17:38:03 `respond --action fix` held until
   `outcome: checks-passed` 18:05:36: test step 12.4 (NM), then **CI monitor 10.8 min after
   the PR existed** (17:54:46→18:05:36). Worker's `sleep 240; no-mistakes axi status` was
   refused by the harness (T:680); two `TaskOutput` timeouts of 10 min.
2. **Devcontainer node_modules repair 6.2 min** — T:253–393 17:06→17:12: `babel-jest`,
   `tailwindcss`, `dayjs` missing after `cli.sh up`; `up --force` ×3, `npm ci` ×6. The NM
   test agent hit the same thing and ran `npm ci` ×3 again (its transcript L79/84/90).
   Worker wrote `devcontainer-npmciall-leaves-root-broken.md` (T:463).
3. **Finding-rationale hunt** — T:618–654 17:33→17:35: 4× `axi logs --step review --full |
   grep`, then `grep -rl "missing-error-path-on-prompt-read" /home/ai` **93.8 s** (T:645),
   then parsing the reviewer's own transcript (T:649). Draft checkpoint wait 8.8 min (T:470→
   472) is by design.

### WAL-23 (9.7 min)
1. Handoff lag 2m09s (E:141 18:32:19 → E:142 18:34:28; `queue/waldir.ack` mtime 18:34:28).
2. `wait_agent` 64.8 s total (main L227→229 55.4 s on `build_pipeline`).
3. Each of 3 forked subagents re-read AGENTS.md/CLAUDE.md and re-ran `gh pr view/diff
   14753` (endpoint_tests 3× L39/45/51) — 3× redundant context load; still under 5 min.
   Not slow. Also: `worker-stopped` E:138 18:29:16.281 fired 41 ms after a **subagent's**
   `task_complete` (18:29:16.240) while main was mid-turn — the detector keys on the tmux
   session's turn-end hook, which a codex subagent also posts.

## 3. Cross-card bottlenecks, ranked by minutes lost today

| # | minutes | bucket | what |
|---|---|---|---|
| 1 | **~560** (497 overnight + 31 + 30 + ~2) | **board signal latency** (worker→lieutenant channel) | Workers went quiet without a board-visible signal and nothing re-alerted. CMD-26: 211.8 min (two silent turn-ends, one one-shot stall alert). LEN-25: 496.6 min on an `AskUserQuestion` the board never saw + 30 min the same way at 02:14. CMD-25: 30.9 min stall caught only by the 30-min watchdog. |
| 2 | **~370** | **review gate** (no-mistakes wall time) | Sum of worker-blocked time on `axi run`/`respond`: CMD-25 88, CMD-26 34 (+220 park counted in #1), LEN-25 128, LEN-26 72, LEN-27 31, MNC-111 20. Inside it: test steps 5.3+18.1+16.6+11.1+9.1+12.4+17.1 ≈ 90 min; review rounds 25 across 7 runs; CI monitors held inside `respond` (LEN-27 10.8, CMD-26 9.7). |
| 3 | **~92** | **review gate** (discarded runs) | LEN-26 3 runs cancelled `superseded by new push` (review 9.1+22.2, test 11.1 ≈ 42); LEN-25 run 2 cancelled after 28/28 green (review 20.7 + test 16.6 + CI ≈ 50). Both by the worker's own push while a run was parked. |
| 4 | **~75** | **testing prescription** | LEN-26 host Functions Jest 38.7 (no emulator) + polluted app unit runs ≈ 5 + universe webpack on root-owned files 11.5; LEN-27 devcontainer `npm ci` repair 6.2 (+1 in the NM test agent); MNC-111 `pgrep` self-block 5.4 + full 1039-test suite 5.2 for a 44-test change; LEN-25 `eslint .` 10.2 failed. |
| 5 | **~70** | **CI** | LEN-19 today: tsc isolation 33 (of 69 total), CI reruns/waits 6.5, park/resume/ruling waits 26 — all downstream of the shared `tsbuildinfo-app-v1-` cache pool. Storybook flake on LEN-26 (E:32 one untouched test) cost a lieutenant intervention (E:33). gh-watch: 262 runs × 28.8 s avg = 2 h 06 m of hook CPU/day, 161 of them logging "duplicate key" for the same dead LEN-19 run (`H:` lines 1–…); attempt-2 job ids defeated dedup and re-alerted (E:252/253, flagged by Lennya E:254). |
| 6 | **~45** | **lieutenant supervision** | CMD-26 "Ready for you" at 20:19 (E:91) without opening the run; lieutenant's side-question that launched the VOC probes (E:66); LEN-26 "Prove the packed package through Functions" (E:12) read as full Jest; LEN-25 lieutenant relayed rulings only when the captain prodded (E:372 12:03 right after E:383 12:02). Chip requests: 5 pushes (E:383, 391, 393, 42, 112) ≈ 10 min of lieutenant turns; `memory/board-and-cards.md:62` says chips come from `worker done` outcome text, `lieutenants/commander/README.md:23` says PATCH — two contradicting rules. |
| 7 | **~32** | **playbook** | draft-first Phase-1 hard stops waiting for the captain: LEN-26 13.6 (E:5→14), CMD-26 9.6 (E:57→60), LEN-27 9.3 (E:99→102). By design — but `playbooks/draft-first-roboflow.md` has no `git fetch` before the branch cut (LEN-26 stale base, 7 commits) and no "run tests in the devcontainer" line (captain C:39 "*playbook never says use devcontainer*"). |
| 8 | **~20** | **brief/prompt** | CMD-26 brief line `Set: annotations replaced, empty list clears them` was wrong → test-gate ask-user (E:64) + probes; brief carries the full captain↔lieutenant thread (1530 words, incl. E:79). LEN-25/CMD-25 workers read `~/.no-mistakes/state.sqlite` and the pipeline's own transcripts because `axi status` truncates findings at 668 chars (E:440). |
| 9 | **~15** | **worker rabbit-holing** | CMD-25 pipeline-commit hunt 3.6 + sqlite 1; CMD-26 probes 7 (tool time); LEN-27 rationale grep 2.1; LEN-25 tsc re-measure to disprove a ruling 5. Small in tool minutes — the damage was what came *after* (the silent park). |
| — | — | board signal latency (pipe) | **not observed**: worker→queue→board write is +0–50 ms (Q:19/E:131 identical to the ms; WAL-23 done exec 18:32:19.195 → event .242). Lag lives in the consumer (`queue/*.ack` 43 s–3 m 43 s behind the event). |

## 4. Plan for tomorrow — cheapest fixes, biggest savings

1. **Server: re-arm `stopNotified`/`staleNotified` on every turn-end, and repeat the stall
   alert.** `server/server.js:4262-4270` — set `w.stopNotified` per *turn*, not per
   stop-state: clear it whenever `lastTurnEnd` advances past the last `worker-send`. In the
   watchdog (`server.js:3093`) drop `!w.staleNotified` as a hard gate and re-notify every
   `BC_WORKER_STALE_SECS` (or escalate to level 1 on the second hit). Also clear
   `staleNotified` in the normal (not-done) `worker-send` branch at `server.js:2853`, matching
   the comment at `:3091`. Expected saving: CMD-26's 181-min silence becomes ≤ 30 min;
   with the LEN-25/CMD-25 cases ≈ **250 min/day**. One card, ~40 lines + tests in
   `test/workers.test.js`.

2. **Worker skill: `AskUserQuestion` is not a channel; every ask-user finding is a signal,
   and a turn never ends with a parked gate.** Add to
   `~/.claude/skills/bridge-commander-worker/SKILL.md` §"Two verbs", one bullet: *"A ruling
   you need goes out as `worker signal` before your turn ends. `AskUserQuestion` reaches
   nobody here."* And to `playbooks/no-mistakes-roboflow.md:36-38` and
   `playbooks/draft-first-roboflow.md` Phase 2 step 3: *"After `respond`, stay in the turn
   (`no-mistakes axi status` via Monitor) until the run reaches `outcome:` or the next gate;
   signal at every gate."* Expected saving: LEN-25's 497 min (board-visible at 03:46 instead
   of 12:02) and the CMD-26 park. **≈ 200 min/day** independent of #1.

3. **Playbooks: fetch before cut, devcontainer for anything heavier than a unit file.**
   `playbooks/draft-first-roboflow.md` §Branch (line ~24) and
   `playbooks/no-mistakes-roboflow.md:25`: replace `git checkout -b {{BRANCH}}` with
   `git fetch origin master && git checkout -b {{BRANCH}} origin/master` (MNC-111 fixes the
   server side of this; the playbook line is the belt to its braces). Add one line under
   Phase 1 step 2 / Delivery step 1: *"Roboflow tests run only through
   `.claude/skills/devcontainer/cli.sh itest|utest <path>` — a host `npx jest` has no
   emulators and fails 900+ suites."* (evidence LEN-26 T:881; `learnings/roboflow/
   devcontainer.md:16-22` already says this, the playbook doesn't). Expected saving: LEN-26's
   38.7-min Jest + 3 cancelled runs ≈ **80 min/day** on Roboflow cards.

4. **no-mistakes: never let the worker's push cancel a parked run; cap `--instructions`.**
   Two behaviours in the daemon (project `no-mistakes`): (a) when a run is
   `awaiting_approval` and a new push arrives, prompt the worker (CLI `axi run` refuses with
   "run X is parked at <step> with N findings — `respond` or `cancel` first") instead of
   `cancelled: superseded by new push` (NM `01M0ZHAE`, `01M0Z0Q1` errors); (b) pass
   `--instructions` to the fix agent via a file/stdin, not argv (NM `01M0XX45` error
   `fork/exec … argument list too long`). Also raise the `axi status` finding truncation
   from 668 chars (E:440) so workers stop reading `state.sqlite`. Expected saving:
   ≈ **90 min/day** of discarded pipeline work + the 8-hour LEN-25 crash.

5. **Lieutenant memory: verify the gate, not the worker's prose, before saying "ready"; and
   one chip rule.** `memory/driving-workers.md:65` already says "Run the claim yourself" for
   done — extend it to status prods: *"Before answering `status?` on a card with a
   no-mistakes run, run `no-mistakes axi status --run <id>`; `awaiting_agent` with a park
   > 10 min is a stalled worker, say so."* (CMD-26 E:91 vs NM `parked 3h37m`). Reconcile
   `memory/board-and-cards.md:62` ("chips come from the outcome text") with
   `lieutenants/commander/README.md:23-24` (PATCH the attribute) into one line in
   `board-and-cards.md`: the exact `bc-axi card patch <id> --attr prs=…` shape that worked
   for LEN-24, to be run the moment a draft PR URL arrives in a signal. Expected saving:
   CMD-26's 20:19→21:12 hour, the 5 chip pushes, and one fewer reason for the captain to
   open tmux ≈ **60 min/day** and most of the swearing.

Not in the top five but worth a card: MNC-111's test agent `pgrep -f` self-match (5.4 min
per run on this repo — a `pgrep -f` pattern must not appear in the caller's own argv; put
the pattern in a variable with a `[n]ode` bracket trick), LEN-19-style `sleep` loops
(`memory/driving-workers.md` should say "supervision is a `Monitor`, never a foreground
loop"), and the gh-watch hook re-logging a dead run every 5 min for 13 h (dedup on run id +
attempt, and stop watching a branch whose card left Working).
