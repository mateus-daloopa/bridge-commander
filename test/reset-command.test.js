'use strict';
// /reset — start a lieutenant over on the launch prompt, with no memory of the
// conversation and every bit of its identity intact.
//
// It is a BOARD command, not a harness one: the harness has no idea what a
// lieutenant is, and the launch prompt is doctrine + charter + what it owns.
const test = require('node:test');
const assert = require('node:assert');
const { startServerWithLieutenant, LT } = require('./helper');

async function commands(s, target) {
  const r = await fetch(s.base + '/api/commands?target=' + encodeURIComponent(target));
  return (await r.json()).commands || [];
}

test('/reset is offered on a lieutenant, and never on a card', async () => {
  const s = await startServerWithLieutenant();
  try {
    const lt = await commands(s, 'lieutenant:' + LT);
    assert.ok(lt.some((c) => c.name === '/reset'), 'a lieutenant can be started over');

    const made = await s.api('POST', '/api/cards', { title: 'c', owner: LT, actor: 'user' });
    assert.strictEqual(made.status, 200);
    const card = await commands(s, 'card:' + made.body.card.id);
    assert.ok(!card.some((c) => c.name === '/reset'),
      "a worker's session belongs to its card — resetting it would hand it a lieutenant's doctrine");
  } finally { await s.stop(); }
});

test('/reset is still offered when the session is dead — that is when it is needed', async () => {
  const s = await startServerWithLieutenant();
  try {
    // The fixture lieutenant is registered without a real agent session, which
    // is the same shape as one whose session died.
    const lt = await commands(s, 'lieutenant:' + LT);
    assert.deepStrictEqual(lt.map((c) => c.name), ['/reset'],
      'the harness offers nothing without a session; the board still offers this');
  } finally { await s.stop(); }
});

test('a lieutenant with nothing to respawn FROM is told so, in the thread', async () => {
  const s = await startServerWithLieutenant();
  try {
    const r = await s.api('POST', '/api/feedback',
      { actor: 'user', target: 'lieutenant:' + LT, text: '/reset' });
    assert.strictEqual(r.status, 200);
    const board = (await s.api('GET', '/api/board')).body;
    const chat = board.lieutenants.find((l) => l.id === LT).chat;
    const last = chat[chat.length - 1];
    assert.match(last.text, /no session to reset/i);
    assert.strictEqual(last.cmd.name, '/reset');
    assert.ok(last.cmd.reply, 'the refusal is a command reply in the thread, not an HTTP error');
  } finally { await s.stop(); }
});

test('the command and its reply both land in the thread', async () => {
  const s = await startServerWithLieutenant();
  try {
    await s.api('POST', '/api/feedback', { actor: 'user', target: 'lieutenant:' + LT, text: '/reset' });
    const board = (await s.api('GET', '/api/board')).body;
    const chat = board.lieutenants.find((l) => l.id === LT).chat;
    const asked = chat[chat.length - 2];
    assert.strictEqual(asked.author, 'user');
    assert.strictEqual(asked.text, '/reset');
    assert.ok(!asked.cmd.reply);
  } finally { await s.stop(); }
});
