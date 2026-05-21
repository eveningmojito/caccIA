#!/usr/bin/env node
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const url  = require('url');

const PORT   = 8080;
const PUBLIC = path.join(__dirname, 'public');
const CLUES  = require('./data');
const TOTAL  = CLUES.length; // 9

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

// ─── Main dispatcher ──────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
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
    res.writeHead(404); return res.end();
  }

  res.writeHead(405); res.end();
});

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n🏴‍☠️  Caccia al Tesoro — Server avviato!\n');

  if (ALL_IPS.length === 0) {
    console.log(`⚠️  Nessun IP di rete trovato. Usa: http://localhost:${PORT}/`);
  } else {
    console.log('📱  URL per i dispositivi sul WiFi:\n');
    ALL_IPS.forEach(({ address, name }) => {
      console.log(`    http://${address}:${PORT}/         (adattatore: ${name})`);
    });
    console.log('');
    console.log(`⚙️   Admin panel  : http://${IP}:${PORT}/admin`);
    console.log(`🖨️   QR da stampare: http://${IP}:${PORT}/qrprint`);
  }

  console.log(`\n🔑  PIN admin predefinito: ${state.adminPass}`);

  console.log('\n─────────────────────────────────────────────────────');
  console.log('🔥  Se il telefono non riesce a connettersi:');
  console.log('');
  console.log('  Windows → apri Pannello di Controllo > Windows Defender');
  console.log(`           Firewall > Regole in entrata > Nuova regola`);
  console.log(`           Porta TCP ${PORT}, Consenti connessione.`);
  console.log('           Oppure lancia questo comando in PowerShell admin:');
  console.log(`           netsh advfirewall firewall add rule name="CacciaTestoro" dir=in action=allow protocol=TCP localport=${PORT}`);
  console.log('');
  console.log('  macOS   → Preferenze di Sistema > Sicurezza > Firewall');
  console.log('           Aggiungi node (o disabilita temporaneamente).');
  console.log('');
  console.log('  Linux   → sudo ufw allow ' + PORT);
  console.log('─────────────────────────────────────────────────────');
  console.log('\n    Premi CTRL+C per fermare il server.\n');
});
