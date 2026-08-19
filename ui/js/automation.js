// The ⚡ screen: the board's clock and the scripts it fires, in one place.
//
// Hooks and schedules were two tabs four deep in config, a screen he visits
// twice a month. They are not configuration — they are a running thing with a
// countdown and an exit code, and this is the mode he watches them in.
//
// The two lists stay in their own modules (hkmanager.js, scmanager.js): the
// wiring moved here, the behaviour did not. This file is the shell — it reads
// the schedules FIRST so the hooks list can say what fires each hook, it hands
// each list the action that jumps to the other, and it writes the masthead.
//
// The masthead answers one question without scrolling: is anything red. That is
// the reason this screen gets opened at all, so the count is the loudest thing
// on it and both lists sort their red to the top.
import { renderSchedules, scheduleCounts, focusSchedule, onOpenHook } from './scmanager.js';
import { renderHooks, hookCounts, focusHook, onOpenSchedule } from './hkmanager.js';

// A schedule names its hook and a hook names what fires it, so each list is
// handed the other's focus rather than reaching for it — the shape filepane's
// onModeSwitch uses.
onOpenHook(focusHook);
onOpenSchedule(focusSchedule);

const alarmEl = document.getElementById('au-alarm');
const countsEl = document.getElementById('au-counts');

// `reload` is what ENTERING the mode passes — a fresh look, not last visit's
// answer. Every render asks the server either way (a schedule fires, a hook is
// run from the CLI, and the board event that arrives is this screen's only
// nudge), which is also why nothing here polls.
//
// Schedules first and awaited: a hook card says which schedules fire it, and it
// reads that off the answer this line puts in place.
export async function renderAutomation(reload) {
  await renderSchedules(reload);
  await renderHooks(reload);
  paintMasthead();
}

function paintMasthead() {
  const s = scheduleCounts();
  const h = hookCounts();
  countsEl.textContent = plural(s.total, 'schedule') + ' · ' + plural(h.total, 'hook');
  const bad = s.bad + h.bad;
  alarmEl.hidden = !bad;
  if (!bad) return;
  // Named, not just counted: "2 need attention" sends him looking, and the two
  // halves are found in different columns.
  const parts = [];
  if (s.bad) parts.push(plural(s.bad, 'schedule') + ' failing');
  if (h.bad) parts.push(plural(h.bad, 'hook') + ' failing');
  alarmEl.textContent = parts.join(' · ');
}

function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
