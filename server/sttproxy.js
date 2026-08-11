'use strict';
// The STT engine (whisper), served from the board's own origin.
//
// Same shape as ttsproxy.js, and for the same reason: the board is behind
// https through a tunnel, so a page it served cannot talk to a plain-http
// engine on the tailnet. It also cannot open a microphone outside a secure
// context, which makes this the only route dictation has.
//
// `/api/stt/<rest>` goes to `<engine>/<rest>` and nothing else happens: same
// method, same path, same query, same headers, same status, same bytes. No
// cache, no retry, no defaults filled in, no knowledge of which paths the
// engine has. A condition on a path or a body in this file is a bug.
//
// The idle-byte-gap deadline, the abort propagation and the streaming are
// ttsproxy.js's, unchanged — read the comments there for why each one is
// load-bearing. The one thing that file does not teach is the websocket, and
// that is the second half of this one.
const http = require('http');
const https = require('https');

const IDLE_MS = parseInt(process.env.BC_STT_IDLE_MS, 10) > 0
  ? parseInt(process.env.BC_STT_IDLE_MS, 10) : 20000;

// engine: the base url from config (no trailing slash). rest: everything after
// the prefix, already including its leading slash and query string, still
// percent-encoded exactly as the browser sent it.
function proxyStt(req, res, engine, rest) {
  const target = engine + rest;
  const mod = target.startsWith('https:') ? https : http;
  const headers = Object.assign({}, req.headers);
  delete headers.host; // the engine's host, not the board's — everything else rides along
  let done = false;
  let timer = null;
  const disarm = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const fail = (e) => {
    disarm();
    up.destroy();
    if (res.headersSent || res.destroyed) return res.destroy();
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: String((e && e.message) || e) }));
  };
  // Silence that is ours, not the engine's: a request still uploading, or a
  // client too slow to drain. Neither one is the engine going quiet.
  const ourSilence = () => !req.readableEnded || res.writableNeedDrain || res.writableLength > 0;
  const arm = () => {
    disarm();
    timer = setTimeout(() => {
      if (ourSilence()) return arm();
      fail(new Error('no bytes from upstream for ' + IDLE_MS + 'ms'));
    }, IDLE_MS);
  };
  const up = mod.request(target, { method: req.method, headers }, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.on('data', arm);
    r.once('end', () => { done = true; disarm(); });
    r.on('error', () => { disarm(); res.destroy(); });
    r.pipe(res);
  });
  up.on('error', fail);
  res.on('close', () => { disarm(); if (!done) up.destroy(); });
  arm();
  req.pipe(up);
}

// The websocket half. `/api/stt/ws/transcribe` has to reach
// `ws://<engine>/ws/transcribe`, and the cheapest correct way to do that is to
// stay below the protocol: hand the engine the client's own handshake headers
// (its Sec-WebSocket-Key included, so the browser validates the engine's own
// accept), relay the engine's 101 back byte for byte, and then pipe the two
// sockets at each other until one of them closes.
//
// Nothing here parses a frame. Audio going up and JSON coming down are the
// same thing to this function: bytes, in order, in both directions.
function proxySttUpgrade(req, socket, head, engine, rest) {
  const target = new URL(engine + rest);
  const mod = target.protocol === 'https:' ? https : http;
  const headers = Object.assign({}, req.headers);
  delete headers.host;
  const bail = () => { socket.destroy(); };
  const up = mod.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port,
    path: target.pathname + target.search,
    method: req.method,
    headers,
  });
  up.on('upgrade', (r, upSocket, upHead) => {
    // The engine's own status line and headers, verbatim — the accept hash in
    // there is the one the browser is about to check.
    const lines = ['HTTP/1.1 ' + r.statusCode + ' ' + r.statusMessage];
    for (let i = 0; i < r.rawHeaders.length; i += 2) lines.push(r.rawHeaders[i] + ': ' + r.rawHeaders[i + 1]);
    socket.write(lines.join('\r\n') + '\r\n\r\n');
    // Frames either side already sent past its handshake go first, in order.
    if (upHead && upHead.length) socket.write(upHead);
    if (head && head.length) upSocket.write(head);
    // Dictation is measured in milliseconds here; Nagle would add tens of them
    // to every small frame in both directions.
    socket.setNoDelay(true);
    upSocket.setNoDelay(true);
    // Either end closing takes the other with it. Piping alone does not: a
    // browser tab that vanishes destroys its socket without ever sending a
    // close frame or an EOF, and the engine would sit holding a transcription
    // session for a page that is gone.
    const drop = () => { socket.destroy(); upSocket.destroy(); };
    socket.on('error', drop);
    socket.on('close', drop);
    upSocket.on('error', drop);
    upSocket.on('close', drop);
    // A FIN from one end finishes that end too. Both of these sockets came off
    // an http.Server, which leaves them half-open capable so a response can
    // still be written after the request's FIN — a websocket has no use for
    // that, and without this the connection would sit half-dead forever
    // instead of closing and taking the other side with it (above).
    socket.on('end', () => socket.end());
    upSocket.on('end', () => upSocket.end());
    socket.pipe(upSocket);
    upSocket.pipe(socket);
  });
  // The engine answered with an ordinary response instead of upgrading (a 404,
  // a refusal). That answer is the client's to see, so it goes down the raw
  // socket as it stands.
  up.on('response', (r) => {
    const lines = ['HTTP/1.1 ' + r.statusCode + ' ' + r.statusMessage];
    for (let i = 0; i < r.rawHeaders.length; i += 2) lines.push(r.rawHeaders[i] + ': ' + r.rawHeaders[i + 1]);
    socket.write(lines.join('\r\n') + '\r\n\r\n');
    r.on('error', bail);
    r.pipe(socket);
  });
  up.on('error', bail);
  socket.on('error', () => up.destroy());
  socket.on('close', () => up.destroy());
  up.end();
}

module.exports = { proxyStt, proxySttUpgrade };
