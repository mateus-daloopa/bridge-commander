// Optimistic sends: a client-only pending list, keyed by target. The server's
// doc is authoritative and replaced wholesale on every SSE broadcast, so a
// just-sent message must live BESIDE it until its echo lands — otherwise the
// composer clears (the 200 is delivery) and the message exists nowhere on
// screen. renderChat() merges these after the server messages; pendingFor()
// reconciles on every render, dropping an entry the moment its echo is in the
// thread, so there is never a frame with both bubbles.
import { USER } from './state.js';

const pending = new Map(); // target -> [{ text, atts, ts, seq }] in send order
let seq = 0;

// The one echo predicate, shared with chat.js's watchEcho: a thread message m
// is the server echo of pending entry p. Text matches by exact text;
// attachments-only matches by the uploaded attachment ids (the server
// re-resolves metas by id, so the echo carries the same ids).
export function isEchoOf(m, p) {
  if (m.author !== USER) return false;
  if (p.text) return m.text === p.text;
  const ids = new Set((m.attachments || []).map((a) => a.id));
  return p.atts.length > 0 && p.atts.every((a) => ids.has(a.id));
}

export function addPending(target, text, atts) {
  const p = { text: text || '', atts: atts || [], ts: new Date().toISOString(), seq: ++seq };
  const list = pending.get(target);
  if (list) list.push(p); else pending.set(target, [p]);
  return p;
}

// Reconcile against the target's server messages and return what's still
// pending. Cheap: a no-op map lookup for targets with nothing in flight.
export function pendingFor(target, msgs) {
  const list = pending.get(target);
  if (!list || !list.length) return [];
  const kept = list.filter((p) => !msgs.some((m) => isEchoOf(m, p)));
  if (kept.length !== list.length) {
    if (kept.length) pending.set(target, kept); else pending.delete(target);
  }
  return kept;
}
