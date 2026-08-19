'use strict';
// The file screen's markdown preview needs the file's own uri, or a relative
// image in it has nothing to resolve against. fileedit.js reads `opts.key` and
// filepane.js is the only thing that fills it — it once did not, and the
// symptom was a document whose attachment:// image loaded (no base needed) and
// whose sibling image beside it did not. Both files bind DOM at import time, so
// pin the wiring at the source level.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'ui', 'js', f), 'utf8');

test('filepane hands the editor the open file key', () => {
  const src = read('filepane.js');
  const m = /mountFileEditor\)\(body, \{([\s\S]*?)\n  \}\);/.exec(src);
  assert.ok(m, 'the mount call is in filepane.js');
  assert.match(m[1], /\bkey:\s*open\.key\b/, 'the mount opts carry key: open.key');
});

test('the editor preview resolves markdown against that key', () => {
  const src = read('fileedit.js');
  assert.match(src, /md\(text,\s*uriDir\(o\.key\)\)/, 'the preview passes uriDir(o.key) as the base');
});
