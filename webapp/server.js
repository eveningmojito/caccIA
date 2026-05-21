#!/usr/bin/env node
'use strict';

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');
const url   = require('url');

const PORT       = 8080;
const HTTPS_PORT = 8443;
const PUBLIC = path.join(__dirname, 'public');
const CLUES  = require('./data');
const TOTAL  = CLUES.length; // 9

// ─── Embedded self-signed certificate (pre-generated, valid 10 years) ─────────
// Eliminates any dependency on openssl or external tools — works on Windows, Mac, and Linux.
// The browser will show a one-time "not secure" warning — click Advanced -> Proceed.
const EMBEDDED_CERT = '-----BEGIN CERTIFICATE-----\nMIIDETCCAfmgAwIBAgIUCfY0bbx7xd0Io4BGfhiXshvyn94wDQYJKoZIhvcNAQEL\nBQAwGDEWMBQGA1UEAwwNY2FjY2lhLXRlc29ybzAeFw0yNjA1MjEyMjA4MTFaFw0z\nNjA1MTgyMjA4MTFaMBgxFjAUBgNVBAMMDWNhY2NpYS10ZXNvcm8wggEiMA0GCSqG\nSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCww8B8UD/uiw8TzPpCdVzoy2gEm0gvrWlL\ne03oefU7VNCfPhzrRaHr5b7/tKBowdW2hRK1qBUmuhEULao3iV/zkVb8YBOkpNNx\nazHVfEDSbPyU91Y5M9rTd2yRA1x1/XzxlhsHC58J2VTj9iPIjwXPTdH6ZuG9S+ER\nyxe68HldAd4oTwNYMHSgg+pi+5qxcrIH3n4BPDTHESro2tEziThTu3heMa3GWRR6\nMgblenZzrHTWNlZImlMucUbXo+Q1cOAaZJqbjYANQ8VSmkGT5o5cYn+Mr6p3/ZU8\n5htgpUsP53Msm3MrihD1vKRyclvnpJRUC3hkURvY5eE1SM/JRf1rAgMBAAGjUzBR\nMB0GA1UdDgQWBBScfWqTckQfUH4cUpaqIrFsaib3zDAfBgNVHSMEGDAWgBScfWqT\nckQfUH4cUpaqIrFsaib3zDAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUA\nA4IBAQChOyEQAmaxnipsCVKvysQ9dratgKv6A5ORfsiHabO0O8rw+vYOB17wG3oY\ncI3c3fBQjpwpfC4uYa5o8vNMwZR4KAJCh33rOTKL3DL6zygXGbWx0t9MZ/kX1qsw\nphAXlQiccOrQUBfKhbVZn2oPWTIR92re4zhYiXMVyEEWBpgD145IQR7SD3ejc0Tv\nEfAr1rPYlcU1mpDMugHwq4/eMdYuF7i70jiSuYAc+72rcZBNnSiiDz+cDx+UL/Jw\nRb/A8QQpFrInMHqoSCczn/PVEOxYD2EnK1l1lKjQk6CJF2yA49aKPVQFsXfzNCAi\n9k4i6hJFO8Diu3nmlu4IAMvbX7RS\n-----END CERTIFICATE-----';
const EMBEDDED_KEY  = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCww8B8UD/uiw8T\nzPpCdVzoy2gEm0gvrWlLe03oefU7VNCfPhzrRaHr5b7/tKBowdW2hRK1qBUmuhEU\nLao3iV/zkVb8YBOkpNNxazHVfEDSbPyU91Y5M9rTd2yRA1x1/XzxlhsHC58J2VTj\n9iPIjwXPTdH6ZuG9S+ERyxe68HldAd4oTwNYMHSgg+pi+5qxcrIH3n4BPDTHESro\n2tEziThTu3heMa3GWRR6MgblenZzrHTWNlZImlMucUbXo+Q1cOAaZJqbjYANQ8VS\nmkGT5o5cYn+Mr6p3/ZU85htgpUsP53Msm3MrihD1vKRyclvnpJRUC3hkURvY5eE1\nSM/JRf1rAgMBAAECggEAHynDq6byPnnhpJoEnObYBGqn4fgGV/F4mMgaShwGMfmX\n9hsbOhdCnrYYYDhV92IE7XK0g7YoVHWFQUtzsOrVMbmz3jaKAALXDC3b0UlgnDh+\npzybxOXxdEqfp0kyadLQzj6qcSmJVlEseCwSzu74FT4hAMZWkerouRxXCKwQmWbJ\nhXUrDDUwdbBg7eBmO3t8VWJlr/Kx7821Izj0D5vm+FjnHpGulTp2rjv00UdKsdzT\nQGSeJ5Vq3ZnVJfEKPxi7AwTpd8j1AKz/+I5qn47yh3T3xrqQyQgziYPl/mq/d83e\nV1ykVBXsnTToav68b2RkMHJEZ/gC5RgOWnD+IlFDMQKBgQDq6ve8qvPyGaZUf9hK\nTWwrgz5EdnzmYHP0sEl8SBOHZM34k+vr00R+VUFzfbUaD9E173FWZ1ViK4Mfif5r\nnJf5iEsnhsFLw2lavadG+qkJIkZoccKoCvQe4ZEhY5wpFHZPCrmTzxy4HKU35r3F\nI5z7EwwsKGdPSLNyfMUKZ3IhNQKBgQDAoMP3XnxZ3yoDSsIWYwM0vXbP4/yM3z5n\nbs48DB6lc1b6PY8SOcglv9ifhRqqT+0I/TH0ZfQxJ7H1f/AuA58c/lCnT8UNY6TI\nUKc4gV1hR5ecAjDz/RQscqdHIaqomEhejge5JYRUkZ/JEyWOm/OqseX5zi70HGJk\nYnjba9sYHwKBgG4ImvuTM2pd20vPChdbhmQnOD5HJZ+e5BFjlTgSZptPey6I0sOG\nFJn8Awk+g1puuDbELdkj05mE+gkG0NXE5mZqEZG1C8sZ/7oSBU040X5GwKXhSyT8\n5HWmgB0clCOlwvio9F2ocDJIsJarjI3PbZMoy9XPIvy+99aTXJPP+mRVAoGAI9FA\n3wxInwVp8HbEJBmBDRt1ri48VY1lMyJdYrj2MdmCgMFVixQHbU2A4BiF3slBz/wU\nf9c9Uq6I3pdNd6Dgwyleod2pTFYM29pzXYRgcqg3PqEBrTyPtbwT8pwF+ZdnTX2n\nXfvl4Tu6tE7FGwFQi5rMomh+PpHQkc3lnxctBA0CgYEAr/perBJayPGzNV8RMMg3\nbi83CWkvHzkaJYB+KRPn5akqiVZ25xZe/8dDkVNjdWDgfEdxnwUAQCIeTZbyavUA\nYUlS637ijNJPWT1PRAAOXdBghWMiSxJQy0cIFvRNWAjiCUH4Q8I4jk8wzgHYpL5Q\nMPl1WgAc9WNdCwPzpbkc52Q=\n-----END PRIVATE KEY-----';

// ─── Game state ──────────────────────────────────────────────────────────────
// step: 1..9  (which tappa is active)
// phase: 'clue' | 'challenge' | 'waiting' | 'done'
// version: increments on every state change (clients use it for cheap polling)
let state = {
  step:      1,
  phase:     'clue',
  version:   0,
  adminPass: '1234'
};

function bump() { state.version++; }

function clue(n)  { return CLUES[n - 1]; }
function current() { return clue(state.step); }

// ─── Detect LAN IPs ──────────────────────────────────────────────────────────
// Returns all non-internal IPv4 addresses, home-network ranges first.
function getAllLocalIPs() {
  const candidates = [];
  for (const [name, ifaces] of Object.entries(os.networkInterfaces())) {
    for (const i of ifaces) {
      if (i.family !== 'IPv4' || i.internal) continue;
      const a = i.address;
      // Skip link-local (169.254.x.x) and Docker/VM defaults (172.17-19.x.x)
      if (a.startsWith('169.254.')) continue;
      const priority =
        a.startsWith('192.168.') ? 0 :
        a.startsWith('10.')       ? 1 :
        (a.startsWith('172.') && parseInt(a.split('.')[1]) >= 16 && parseInt(a.split('.')[1]) <= 31) ? 2 : 3;
      candidates.push({ name, address: a, priority });
    }
  }
  candidates.sort((a, b) => a.priority - b.priority);
  return candidates;
}

const ALL_IPS = getAllLocalIPs();
// Best guess: first in priority-sorted list, fallback to localhost
const IP = ALL_IPS.length ? ALL_IPS[0].address : '127.0.0.1';

// ─── MIME types ───────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon'
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function json(res, data, status) {
  const body = JSON.stringify(data);
  res.writeHead(status || 200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
  });
}

// ─── State serialisers ────────────────────────────────────────────────────────
// Public state — safe for girls' phone (no quiz answers)
function publicState() {
  const c = current();
  return {
    step:         state.step,
    totalSteps:   TOTAL,
    phase:        state.phase,
    version:      state.version,
    locationName: c.locationName,
    locationIcon: c.locationIcon,
    cluePoem:     state.phase === 'clue'  ? c.cluePoem : null,
    challenge:    state.phase !== 'clue'  ? { title: c.challengeTitle, text: c.challengeText, timerSecs: c.timerSecs } : null
  };
}

// Admin state — includes hints and answers
function adminState() {
  const c = current();
  return {
    step:           state.step,
    totalSteps:     TOTAL,
    phase:          state.phase,
    version:        state.version,
    locationName:   c.locationName,
    locationIcon:   c.locationIcon,
    challengeTitle: c.challengeTitle,
    adminHint:      c.adminHint,
    canApprove:     state.phase === 'waiting',
    canReject:      state.phase === 'waiting',
    ip:             IP,
    allIPs:         ALL_IPS.map(x => ({ address: x.address, iface: x.name })),
    port:           PORT
  };
}

// ─── Route handlers ───────────────────────────────────────────────────────────
function handleQrScan(res, step) {
  const n = parseInt(step, 10);
  if (isNaN(n) || n < 1 || n > TOTAL) {
    return json(res, { ok: false, error: 'invalid_step' }, 400);
  }
  if (n !== state.step) {
    return json(res, { ok: false, error: 'wrong_step', current: state.step });
  }
  if (state.phase === 'clue') {
    state.phase = 'challenge';
    bump();
  }
  // Redirect girls' phone back to main page
  res.writeHead(302, { 'Location': '/' });
  res.end();
}

async function handleReady(req, res) {
  if (state.phase !== 'challenge') {
    return json(res, { ok: false, error: 'wrong_phase' }, 409);
  }
  state.phase = 'waiting';
  bump();
  json(res, { ok: true });
}

async function handleApprove(req, res) {
  const body = await readBody(req);
  if (body.pass !== state.adminPass) return json(res, { ok: false, error: 'wrong_pass' }, 403);
  if (state.phase !== 'waiting') return json(res, { ok: false, error: 'wrong_phase' }, 409);
  if (state.step >= TOTAL) {
    state.phase = 'done';
  } else {
    state.step++;
    state.phase = 'clue';
  }
  bump();
  json(res, { ok: true, state: adminState() });
}

async function handleReject(req, res) {
  const body = await readBody(req);
  if (body.pass !== state.adminPass) return json(res, { ok: false, error: 'wrong_pass' }, 403);
  if (state.phase !== 'waiting') return json(res, { ok: false, error: 'wrong_phase' }, 409);
  state.phase = 'challenge';
  bump();
  json(res, { ok: true });
}

async function handleSkip(req, res) {
  const body = await readBody(req);
  if (body.pass !== state.adminPass) return json(res, { ok: false, error: 'wrong_pass' }, 403);
  if (state.step >= TOTAL) { state.phase = 'done'; }
  else { state.step++; state.phase = 'clue'; }
  bump();
  json(res, { ok: true, state: adminState() });
}

async function handlePrev(req, res) {
  const body = await readBody(req);
  if (body.pass !== state.adminPass) return json(res, { ok: false, error: 'wrong_pass' }, 403);
  if (state.step > 1) { state.step--; }
  state.phase = 'clue';
  bump();
  json(res, { ok: true, state: adminState() });
}

async function handleReset(req, res) {
  const body = await readBody(req);
  if (body.pass !== state.adminPass) return json(res, { ok: false, error: 'wrong_pass' }, 403);
  state.step  = 1;
  state.phase = 'clue';
  bump();
  json(res, { ok: true });
}

async function handleSetPass(req, res) {
  const body = await readBody(req);
  if (body.pass !== state.adminPass) return json(res, { ok: false, error: 'wrong_pass' }, 403);
  if (!/^\d{4,8}$/.test(body.newPass || '')) return json(res, { ok: false, error: 'invalid_pass' }, 400);
  state.adminPass = body.newPass;
  json(res, { ok: true });
}

async function handleAdminAuth(req, res) {
  const body = await readBody(req);
  if (body.pass === state.adminPass) json(res, { ok: true });
  else json(res, { ok: false, error: 'wrong_pass' }, 403);
}

// Called by in-app QR scanner instead of the redirect-based GET /qr/:n
async function handleScan(req, res) {
  const body = await readBody(req);
  const n = parseInt(body.step != null ? body.step : -1, 10);
  if (isNaN(n) || n < 1 || n > TOTAL) {
    return json(res, { ok: false, error: 'invalid_step' }, 400);
  }
  if (n !== state.step) {
    return json(res, { ok: false, error: 'wrong_step', current: state.step });
  }
  if (state.phase === 'clue') { state.phase = 'challenge'; bump(); }
  json(res, { ok: true });
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────
async function requestHandler(req, res) {
  const { pathname } = url.parse(req.url);
  const method = req.method;

  // GET routes
  if (method === 'GET') {
    if (pathname === '/' || pathname === '/index.html') return serveFile(res, path.join(PUBLIC, 'index.html'));
    if (pathname === '/admin')                           return serveFile(res, path.join(PUBLIC, 'admin.html'));
    if (pathname === '/qrprint')                         return serveFile(res, path.join(PUBLIC, 'qrprint.html'));
    if (pathname === '/api/state')                       return json(res, publicState());
    if (pathname === '/api/admin/state')                 return json(res, adminState());

    // QR scan: /qr/1 … /qr/9
    const qrMatch = pathname.match(/^\/qr\/(\d+)$/);
    if (qrMatch) return handleQrScan(res, qrMatch[1]);

    // Other static assets in /public
    const filePath = path.join(PUBLIC, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return serveFile(res, filePath);

    res.writeHead(404); return res.end('Not found');
  }

  // POST routes
  if (method === 'POST') {
    if (pathname === '/api/ready')     return handleReady(req, res);
    if (pathname === '/api/approve')   return handleApprove(req, res);
    if (pathname === '/api/reject')    return handleReject(req, res);
    if (pathname === '/api/skip')      return handleSkip(req, res);
    if (pathname === '/api/prev')      return handlePrev(req, res);
    if (pathname === '/api/reset')     return handleReset(req, res);
    if (pathname === '/api/setpass')   return handleSetPass(req, res);
    if (pathname === '/api/adminauth') return handleAdminAuth(req, res);
    if (pathname === '/api/scan')      return handleScan(req, res);
    res.writeHead(404); return res.end();
  }

  res.writeHead(405); res.end();
}

// ─── Start servers ────────────────────────────────────────────────────────────
const httpSrv  = http.createServer(requestHandler);
const httpsSrv = https.createServer({ key: EMBEDDED_KEY, cert: EMBEDDED_CERT }, requestHandler);

httpSrv.listen(PORT, '0.0.0.0', () => {
  console.log('\n Caccia al Tesoro -- Server avviato!\n');

  if (ALL_IPS.length === 0) {
    console.log('  Nessun IP di rete trovato. Usa: http://localhost:' + PORT + '/');
  } else {
    ALL_IPS.forEach(function(iface) {
      console.log('Adattatore: ' + iface.name);
      console.log('  HTTP  (admin PC)       : http://'  + iface.address + ':' + PORT       + '/admin');
      console.log('  HTTPS (telefono bimbe) : https://' + iface.address + ':' + HTTPS_PORT + '/');
      console.log('  HTTPS (QR da stampare) : https://' + iface.address + ':' + HTTPS_PORT + '/qrprint');
      console.log('');
    });
  }

  console.log('PIN admin predefinito: ' + state.adminPass);
  console.log('');
  console.log('-------------------------------------------------------');
  console.log('PRIMA VISITA dal telefono (una volta sola):');
  console.log('  1. Apri  https://' + IP + ':' + HTTPS_PORT + '/  sul telefono');
  console.log('  2. Tocca "Avanzate" -> "Procedi al sito"');
  console.log('  3. Il bottone fotocamera funzionera senza problemi');
  console.log('-------------------------------------------------------');
  console.log('Firewall -- se il telefono non raggiunge il server:');
  console.log('  Windows (PowerShell admin):');
  console.log('    netsh advfirewall firewall add rule name="CacciaTestoro8080" dir=in action=allow protocol=TCP localport=8080');
  console.log('    netsh advfirewall firewall add rule name="CacciaTestoro8443" dir=in action=allow protocol=TCP localport=8443');
  console.log('  macOS  : Impostazioni -> Firewall -> aggiungi node');
  console.log('  Linux  : sudo ufw allow 8080 && sudo ufw allow 8443');
  console.log('-------------------------------------------------------');
  console.log('  Premi CTRL+C per fermare.\n');
});

httpsSrv.listen(HTTPS_PORT, '0.0.0.0');
