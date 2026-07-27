'use strict';
// Artifact WRITE (PUT /api/artifact) — the file editor's save.
//
// Two things are being defended here, and they are not the same thing:
//  - the captain's work: a write that lands on a file which moved underneath
//    him is refused (409) and nothing is written, so a lost edit is impossible
//    to do silently;
//  - the machine: the board has no auth of its own, so writing is allowed ONLY
//    into a file already listed as some card's artifact. Everything else — an
//    unlisted path, a traversal, a symlink, an upload — is 403 and untouched.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { startServerWithLieutenant, withOwner } = require('./helper');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function cardWithArtifact(s, uri, label) {
  const cr = await s.api('POST', '/api/cards', withOwner({ title: 'Deliverable' }));
  assert.strictEqual(cr.status, 200, JSON.stringify(cr.body));
  const add = await s.api('POST', '/api/cards/' + cr.body.card.id + '/artifacts', { uri, label });
  assert.strictEqual(add.status, 200, JSON.stringify(add.body));
  return { id: cr.body.card.id, uri: add.body.artifact.uri };
}

test('GET hands out a version; PUT with it writes the file and returns the new one', async () => {
  const s = await startServerWithLieutenant();
  try {
    const file = path.join(s.dir, 'brief.md');
    fs.writeFileSync(file, '# brief\n\noriginal line\n');
    const { uri } = await cardWithArtifact(s, file, 'worker brief');

    const got = await s.api('GET', '/api/artifact?uri=' + encodeURIComponent(uri));
    assert.strictEqual(got.status, 200);
    assert.strictEqual(got.body.version, sha256('# brief\n\noriginal line\n'), 'version is sha256 of the content');

    const next = '# brief\n\nedited by the captain\n';
    const put = await s.api('PUT', '/api/artifact', { uri, content: next, version: got.body.version });
    assert.strictEqual(put.status, 200, JSON.stringify(put.body));
    assert.strictEqual(put.body.version, sha256(next));
    assert.strictEqual(fs.readFileSync(file, 'utf8'), next, 'the file on disk IS the new text');

    // and the version the write returned is the one a fresh read hands out
    const again = await s.api('GET', '/api/artifact?uri=' + encodeURIComponent(uri));
    assert.strictEqual(again.body.version, put.body.version);
  } finally {
    await s.stop();
  }
});

test('PUT with a stale version → 409, nothing written, and the answer carries what is on disk', async () => {
  const s = await startServerWithLieutenant();
  try {
    const file = path.join(s.dir, 'brief.md');
    fs.writeFileSync(file, 'first\n');
    const { uri } = await cardWithArtifact(s, file, 'brief');
    const stale = (await s.api('GET', '/api/artifact?uri=' + encodeURIComponent(uri))).body.version;

    // someone else (another agent, another tab) writes it meanwhile
    fs.writeFileSync(file, 'written by someone else\n');

    const put = await s.api('PUT', '/api/artifact', { uri, content: 'my edit\n', version: stale });
    assert.strictEqual(put.status, 409);
    assert.match(put.body.error, /changed on disk/);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'written by someone else\n', 'the other write survives untouched');
    assert.strictEqual(put.body.content, 'written by someone else\n', '409 carries the current content');
    assert.strictEqual(put.body.version, sha256('written by someone else\n'), '…and its version');

    // saving again WITH that version is the deliberate overwrite, and it works
    const again = await s.api('PUT', '/api/artifact', { uri, content: 'my edit\n', version: put.body.version });
    assert.strictEqual(again.status, 200);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'my edit\n');
  } finally {
    await s.stop();
  }
});

test('a missing/blank version is never treated as "no opinion" — it is a 409', async () => {
  const s = await startServerWithLieutenant();
  try {
    const file = path.join(s.dir, 'notes.txt');
    fs.writeFileSync(file, 'on disk\n');
    const { uri } = await cardWithArtifact(s, file, 'notes');
    for (const body of [{ uri, content: 'x\n' }, { uri, content: 'x\n', version: '' }]) {
      const put = await s.api('PUT', '/api/artifact', body);
      assert.strictEqual(put.status, 409, JSON.stringify(put.body));
    }
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'on disk\n');
  } finally {
    await s.stop();
  }
});

test('PUT to a path that is not any card artifact → 403 and the file is untouched', async () => {
  const s = await startServerWithLieutenant();
  try {
    const listed = path.join(s.dir, 'listed.md');
    const secret = path.join(s.dir, 'secret.txt');
    fs.writeFileSync(listed, 'listed\n');
    fs.writeFileSync(secret, 'do not touch\n');
    await cardWithArtifact(s, listed, 'the one artifact');

    for (const uri of ['file://' + secret, secret, 'file:///etc/hosts', '/etc/hosts']) {
      const put = await s.api('PUT', '/api/artifact', { uri, content: 'pwned\n', version: sha256('do not touch\n') });
      assert.strictEqual(put.status, 403, uri + ' → ' + JSON.stringify(put.body));
      assert.match(put.body.error, /not an artifact|only file:\/\//);
    }
    assert.strictEqual(fs.readFileSync(secret, 'utf8'), 'do not touch\n');
  } finally {
    await s.stop();
  }
});

test('a listed uri with a traversal segment is still refused (normalize, then compare)', async () => {
  const s = await startServerWithLieutenant();
  try {
    const secret = path.join(s.dir, 'secret.txt');
    fs.writeFileSync(secret, 'do not touch\n');
    const sub = path.join(s.dir, 'sub');
    fs.mkdirSync(sub);
    // A file:// uri is stored verbatim, so a `..` inside one sails through the
    // allowlist's string compare. The path guard is what stops it before disk:
    // path.resolve is a no-op on an already-clean absolute path, so anything it
    // changes was not clean.
    const uri = 'file://' + sub + '/../secret.txt';
    const cr = await s.api('POST', '/api/cards', withOwner({ title: 'Sneaky' }));
    const add = await s.api('POST', '/api/cards/' + cr.body.card.id + '/artifacts', { uri });
    assert.strictEqual(add.status, 200);
    assert.strictEqual(add.body.artifact.uri, uri, 'stored verbatim — the allowlist alone would pass it');

    const put = await s.api('PUT', '/api/artifact', { uri, content: 'pwned\n', version: sha256('do not touch\n') });
    assert.strictEqual(put.status, 403, JSON.stringify(put.body));
    assert.match(put.body.error, /unsafe artifact path/);
    assert.strictEqual(fs.readFileSync(secret, 'utf8'), 'do not touch\n');
  } finally {
    await s.stop();
  }
});

test('a listed artifact that is a symlink → 403; the link target is never written', async () => {
  const s = await startServerWithLieutenant();
  try {
    const target = path.join(s.dir, 'outside.txt');
    const link = path.join(s.dir, 'innocent.md');
    fs.writeFileSync(target, 'the real file\n');
    fs.symlinkSync(target, link);
    const { uri } = await cardWithArtifact(s, link, 'looks like an artifact');

    // it still READS (the viewer has always followed the file), so the version
    // the editor holds is a genuine one — the refusal is specific to writing
    const got = await s.api('GET', '/api/artifact?uri=' + encodeURIComponent(uri));
    assert.strictEqual(got.status, 200);

    const put = await s.api('PUT', '/api/artifact', { uri, content: 'pwned\n', version: got.body.version });
    assert.strictEqual(put.status, 403, JSON.stringify(put.body));
    assert.match(put.body.error, /symlink/);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'the real file\n');
  } finally {
    await s.stop();
  }
});

test('an uploaded attachment is not writable, and a write leaves no temp file behind', async () => {
  const s = await startServerWithLieutenant();
  try {
    const up = await s.api('POST', '/api/attachments', {
      name: 'notes.txt', mime: 'text/plain', dataBase64: Buffer.from('uploaded\n').toString('base64'),
    });
    assert.strictEqual(up.status, 200, JSON.stringify(up.body));
    const cr = await s.api('POST', '/api/cards', withOwner({ title: 'Has an upload' }));
    await s.api('POST', '/api/cards/' + cr.body.card.id + '/artifacts', { uri: up.body.uri });
    const put = await s.api('PUT', '/api/artifact', { uri: up.body.uri, content: 'x\n', version: 'whatever' });
    assert.strictEqual(put.status, 403, JSON.stringify(put.body));
    assert.match(put.body.error, /only file:\/\//);

    // and the happy path cleans up after itself
    const file = path.join(s.dir, 'clean.md');
    fs.writeFileSync(file, 'a\n');
    const { uri } = await cardWithArtifact(s, file, 'clean');
    const v = (await s.api('GET', '/api/artifact?uri=' + encodeURIComponent(uri))).body.version;
    assert.strictEqual((await s.api('PUT', '/api/artifact', { uri, content: 'b\n', version: v })).status, 200);
    const leftovers = fs.readdirSync(s.dir).filter((n) => n.includes('.tmp'));
    assert.deepStrictEqual(leftovers, [], 'the atomic write renames its temp file away');
  } finally {
    await s.stop();
  }
});
