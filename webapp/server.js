#!/usr/bin/env node
'use strict';

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');
const url   = require('url');
const { execSync } = require('child_process');

const PORT       = 8080;
const HTTPS_PORT = 8443;
const CERT_FILE  = path.join(__dirname, 'cert.pem');
const KEY_FILE   = path.join(__dirname, 'key.pem');
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

// ─── Self-signed HTTPS cert ───────────────────────────────────────────────────
// Generates cert.pem + key.pem via openssl if not present.
// Required for getUserMedia (camera) on Chrome/Android and Safari/iOS on LAN.
function ensureCert() {
  if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) return true;
  try {
    execSync(
      `openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes` +
      ` -keyout "${KEY_FILE}" -out "${CERT_FILE}"` +
      ` -subj "/CN=caccia-tesoro"`,
      { stdio: 'ignore' }
    );
    console.log('✅ Certificato HTTPS generato (cert.pem + key.pem).');
    return true;
  } catch(e) {
    return false;
  }
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
const hasCert   = ensureCert();
const httpSrv   = http.createServer(requestHandler);
const httpsSrv  = hasCert
  ? https.createServer({ key: fs.readFileSync(KEY_FILE), cert: fs.readFileSync(CERT_FILE) }, requestHandler)
  : null;

httpSrv.listen(PORT, '0.0.0.0', () => {
  console.log('\n🏴‍☠️  Caccia al Tesoro — Server avviato!\n');

  if (ALL_IPS.length === 0) {
    console.log(`⚠️  Nessun IP di rete trovato. Usa: http://localhost:${PORT}/`);
  } else {
    ALL_IPS.forEach(({ address, name }) => {
      const http_url  = `http://${address}:${PORT}`;
      const https_url = `https://${address}:${HTTPS_PORT}`;
      console.log(`📡  Adattatore: ${name}`);
      console.log(`    HTTP  (admin PC)      : ${http_url}/admin`);
      if (hasCert) {
        console.log(`    HTTPS (telefono bimbe): ${https_url}/`);
        console.log(`    HTTPS (QR da stampare): ${https_url}/qrprint`);
      } else {
        console.log(`    HTTP  (telefono bimbe): ${http_url}/`);
      }
      console.log('');
    });
  }

  console.log(`🔑  PIN admin predefinito: ${state.adminPass}`);

  if (hasCert) {
    console.log('\n─────────────────────────────────────────────────────');
    console.log('📱  PRIMA VISITA dal telefono (una volta sola):');
    console.log(`    1. Apri https://${IP}:${HTTPS_PORT}/ sul telefono`);
    console.log('    2. Tocca "Avanzate" → "Procedi" (o "Visita il sito non sicuro")');
    console.log('    3. Il bottone 📷 aprirà la fotocamera senza problemi');
    console.log('─────────────────────────────────────────────────────');
  } else {
    console.log('\n⚠️  openssl non trovato — HTTPS non disponibile.');
    console.log('   La fotocamera in-app non funzionerà su Chrome/Android e Safari/iOS.');
    console.log('   Installa openssl e riavvia il server per abilitare HTTPS.');
    console.log('   Windows: scarica da https://slproweb.com/products/Win32OpenSSL.html');
  }

  console.log('\n─────────────────────────────────────────────────────');
  console.log('🔥  Firewall: se il telefono non raggiunge il server:');
  console.log(`   Windows: netsh advfirewall firewall add rule name="CacciaTestoro" dir=in action=allow protocol=TCP localport=${PORT}-${HTTPS_PORT}`);
  console.log(`   macOS  : Preferenze di Sistema → Firewall → aggiungi node`);
  console.log(`   Linux  : sudo ufw allow ${PORT} && sudo ufw allow ${HTTPS_PORT}`);
  console.log('─────────────────────────────────────────────────────');
  console.log('\n    Premi CTRL+C per fermare.\n');
});

if (httpsSrv) {
  httpsSrv.listen(HTTPS_PORT, '0.0.0.0');
}
