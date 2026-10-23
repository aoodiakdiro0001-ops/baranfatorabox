#!/usr/bin/env node
/**
 * Baran FatoraBox v1.0.0 — Self-hosted Arabic invoicing OS (ZERO dependencies)
 * Trust facts:
 *  • Zero dependencies — stock Node ONLY: node server.js (default :3160) or pm2
 *  • Authoritative server-side pricing engine (the client can never set totals)
 *  • ZATCA (Saudi) Phase-1 compliant TLV QR generated locally — your data never leaves the box
 *  • Atomic writes (tmp + rename) — a crash can never corrupt invoices
 *  • Path-safe static hosting, CSP self-only, DENY framing, no-sniff, strict referrer
 *  • Simple per-IP rate limiting + 1MB body cap; binding 127.0.0.1 by default
 *  • Optional passcode gate for every mutating API (X-Fatora-Code)
 * Authored by Baran Avisat — baranavisat@gmail.com — baranavi.gumroad.com
 */
'use strict';
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/* ── config ─────────────────────────────────────────────── */
const VERSION = '1.0.0';
const NAME = 'Baran FatoraBox';
const PORT = parseInt(process.env.PORT || '3160', 10);
const HOST = process.env.FATORA_BIND_ALL === '1' ? '0.0.0.0' : '127.0.0.1';
const ROOT = __dirname;
const DATA = process.env.FATORA_DATA ? path.resolve(process.env.FATORA_DATA) : path.join(ROOT, 'data', 'db.json');
const PUBLIC = path.join(ROOT, 'public');
const BODY_CAP = 1024 * 1024; // 1MB

/* ── database (atomic) ──────────────────────────────────── */
const SEED = {
  meta: { name: 'Baran FatoraBox', version: VERSION, createdAt: new Date().toISOString() },
  seq: 0,
  authHash: null,
  settings: DefaultSettings(),
  clients: [],
  invoices: [],
};
function DefaultSettings() {
  return {
    business: { name: '', legalName: '', vatNumber: '', crNumber: '', address: '', phone: '', email: '' },
    vat: { preset: 'KSA', rate: 15 },
    currency: 'SAR',
    invoicePrefix: 'INV',
    terms: 'شكراً لتعاملكم معنا — هذه الآلة تحسب الفاتورة بصيغة TLV للمرحلة الأولى من ZATCA عند وجود رأس المال الرقمي.',
    lang: 'ar',
  };
}
function writeDB(obj) {
  const tmp = DATA + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1));
  fs.renameSync(tmp, DATA);
}
function loadDB() {
  try {
    const s = JSON.parse(fs.readFileSync(DATA, 'utf8'));
    // FATORA_PASSCODE is the operator's explicit instruction — always wins on boot
    const envCode = process.env.FATORA_PASSCODE;
    if (envCode) {
      const h = sha256(envCode);
      if (s.authHash !== h) { s.authHash = h; writeDB(s); }
    }
    return s;
  } catch (e) {
    const s = JSON.parse(JSON.stringify(SEED));
    if (process.env.FATORA_PASSCODE) s.authHash = sha256(String(process.env.FATORA_PASSCODE));
    writeDB(s);
    return s;
  }
}
fs.mkdirSync(path.dirname(DATA), { recursive: true }); // FATORA_DATA may point anywhere
let db = loadDB();
function saveDB(next) { db = next; writeDB(next); }
function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function nowISO() { return new Date().toISOString(); }
function id(prefix) { return prefix + crypto.randomBytes(6).toString('hex'); }

/* ── security helpers ───────────────────────────────────── */
const buckets = new Map(); // ip -> {get:[ts...], post:[ts...]}
function rateOK(ip, kind) {
  const limit = kind === 'post' ? 30 : 240, win = 60000, t = Date.now();
  const b = buckets.get(ip) || { get: [], post: [] };
  b[kind] = (b[kind] || []).filter(x => t - x < win);
  if (b[kind].length >= limit) return false;
  b[kind].push(t); buckets.set(ip, b);
  if (buckets.size > 5000) buckets.clear();
  return true;
}
function authed(req) {
  const code = (req.headers['x-fatora-code'] || '').trim();
  if (!db.authHash) return true; // no passcode configured → open (local-first binder)
  if (!code) return false;
  const h = sha256(code);
  if (h.length !== db.authHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(db.authHash));
}
function headersCSP(res) {
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'");
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}
function json(res, code, obj) {
  headersCSP(res);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
const bad = (res, msg, code) => json(res, code || 400, { ok: false, error: msg });

/* ── pricing engine (server is the authority) ───────────── */
function round2(x) { return Math.round((Number(x) + Number.EPSILON) * 100) / 100; }
function computeTotals(items) {
  let subtotal = 0, vatTotal = 0;
  for (const it of items) {
    const qty = Number(it.qty) || 0, price = Number(it.price) || 0;
    let disc = 0;
    if (it.discountType === 'percent') disc = (qty * price * (Number(it.discountValue) || 0)) / 100;
    else if (it.discountType === 'amount') disc = Number(it.discountValue) || 0;
    const net = Math.max(0, qty * price - disc);
    const rate = Number(it.vatRate == null ? it.vat : it.vatRate) || 0;
    subtotal += net;
    vatTotal += net * (Math.max(0, Math.min(100, rate)) / 100);
  }
  return { subtotal: round2(subtotal), vatTotal: round2(vatTotal), total: round2(subtotal + vatTotal) };
}

/* ── TLV (ZATCA Phase-1) ────────────────────────────────── */
function tlvBase64(sellerName, vatNumber, timestampISO, invoiceTotal, vatTotal) {
  const fields = [
    [1, Buffer.from(String(sellerName), 'utf8')],
    [2, Buffer.from(String(vatNumber), 'utf8')],
    [3, Buffer.from(String(timestampISO), 'utf8')],
    [4, Buffer.from(Number(invoiceTotal).toFixed(2), 'utf8')],
    [5, Buffer.from(Number(vatTotal).toFixed(2), 'utf8')],
  ];
  for (const [, v] of fields) if (v.length === 0 || v.length > 255) return null;
  return Buffer.concat(fields.map(([tag, v]) => Buffer.concat([Buffer.from([tag, v.length]), v]))).toString('base64');
}

/* ── QR encoder (versions 1..6, ECC level M — zero-dependency) ── */
/* Standard QR: byte mode. ECC table (M): [total, dataCodewords, ecPerBlock, blocks] */
const RS = (() => {
  const exp = new Uint8Array(512), log = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) { exp[i] = x; log[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];
  function mul(a, b) { return (a === 0 || b === 0) ? 0 : exp[log[a] + log[b]]; }
  function genPoly(n) { // g(x) = ∏(x + α^i), highest-first coefficients — MUST stay monic (p[0]=1)
    let p = [1];
    for (let i = 0; i < n; i++) {
      const np = new Array(p.length + 1).fill(0);
      for (let j = 0; j < p.length; j++) np[j] ^= p[j];                 // ×x  (leading slot)
      for (let j = 0; j < p.length; j++) np[j + 1] ^= mul(exp[i], p[j]); // + α^i·p (shifted right)
      p = np;
    }
    return p;
  }
  function encode(data, ecCount) {
    const g = genPoly(ecCount);
    const buf = data.concat(new Array(ecCount).fill(0));
    for (let i = 0; i < data.length; i++) {
      const f = buf[i];
      if (f !== 0) for (let j = 0; j < g.length; j++) buf[i + j] ^= mul(g[j], f);
    }
    return buf.slice(data.length); // remainder = ec codewords
  }
  return { encode };
})();
const QRv = [ // version 1..6 @M: [totalCW, dataTotalCW(ALL blocks), ecPerBlock, blocks] — ISO 18004 table
  [26, 16, 10, 1], [44, 28, 16, 1], [70, 44, 26, 1], [100, 64, 18, 2], [134, 86, 24, 2], [172, 108, 16, 4],
];
function qrBuild(bytes, level) { // level 'M' fixed in v1
  // choose smallest version that fits
  const bitsAvail = v => QRv[v - 1][1] * 8 - 12; // mode(4)+count(8)
  let v = 0;
  for (let i = 1; i <= 6; i++) if (bytes.length * 8 <= bitsAvail(i)) { v = i; break; }
  if (!v) return null;
  const [total, dataCW, ecPer, blocks] = QRv[v - 1];
  // bit stream
  const bits = [];
  const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(4, 4); push(bytes.length, 8);
  for (const b of bytes) push(b, 8);
  const cap = dataCW * 8;
  const term = Math.min(4, cap - bits.length); for (let i = 0; i < term; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const cw = [];
  for (let i = 0; i < bits.length; i += 8) { let x = 0; for (let j = 0; j < 8; j++) x = (x << 1) | bits[i + j]; cw.push(x); }
  // pad codewords to dataCW with the standard alternating 0xEC / 0x11
  let alt = false;
  while (cw.length < dataCW) { cw.push(alt ? 0x11 : 0xEC); alt = !alt; }
  if (cw.length > dataCW) return null; // unreachable (capacity pre-checked)
  // split blocks (sizes as balanced as the standard requires)
  const blockDefs = [];
  let offs = [], acc = 0;
  for (let b = 0; b < blocks; b++) {
    const n = Math.floor(dataCW / blocks) + (b < dataCW % blocks ? 1 : 0);
    blockDefs.push({ data: cw.slice(acc, acc + n) });
    acc += n;
  }
  const sizes = blockDefs.map(b => b.data.length);
  const ecData = blockDefs.map(b => RS.encode(b.data, ecPer));
  // interleave: data across blocks round-robin, then EC across blocks
  const seq = [];
  const maxD = Math.max(...sizes);
  for (let i = 0; i < maxD; i++) for (let b = 0; b < blocks; b++) if (i < sizes[b]) seq.push(blockDefs[b].data[i]);
  for (let i = 0; i < ecPer; i++) for (let b = 0; b < blocks; b++) seq.push(ecData[b][i]);
  return { version: v, size: 17 + v * 4, seq, dataCW, ecPer, blocks, sizes };
}
function qrBuildFallback() { return null; } // v1: only level-M path (TLV stays ≤ ~106 bytes)
const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r, c) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
  (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
  (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
];
function getBCH(data) { // format BCH(15,5)
  const G15 = 0b10100110111, M = 0b101010000010010;
  const digits = x => { let n = 0; while (x !== 0) { n++; x >>>= 1; } return n; };
  let d = data << 10;
  while (digits(d) - digits(G15) >= 0) d ^= G15 << (digits(d) - digits(G15));
  return ((data << 10) | d) ^ M;
}
function qrMatrix(payloadBytes) {
  const enc = qrBuild(Array.from(payloadBytes));
  if (!enc) return null;
  const size = enc.size, n = size;
  const fn = Array.from({ length: n }, () => new Array(n).fill(false)); // functional map
  const mod = Array.from({ length: n }, () => new Array(n).fill(false));
  const setF = (r, c, v) => { fn[r][c] = true; mod[r][c] = !!v; };
  // finders + separators
  const finder = (r0, c0) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const rr = r0 + r, cc = c0 + c;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
      const inFinder = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      const on = inFinder && ((r === 0 || r === 6) || (c === 0 || c === 6) || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      fn[rr][cc] = true; mod[rr][cc] = !!on;
    }
  };
  finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
  // timing
  for (let i = 8; i < n - 8; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
  // alignment (v>=2): single pattern at (a,a), a = 4v+10
  if (enc.version >= 2) {
    const a = 4 * enc.version + 10;
    for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) {
      const on = Math.max(Math.abs(r), Math.abs(c)) !== 1;
      fn[a + r][a + c] = true; mod[a + r][a + c] = on;
    }
  }
  fn[n - 8][8] = true; mod[n - 8][8] = true; // dark module
  // reserve ALL functional areas (incl. both format-info copies) BEFORE mapping data positions
  {
    const reserve = (r, c) => { fn[r][c] = true; };
    for (let i = 0; i < 9; i++) { reserve(8, i); reserve(i, 8); }
    for (let i = 0; i < 8; i++) { reserve(8, n - 1 - i); reserve(n - 1 - i, 8); }
  }
  // data placement (zigzag) — data positions = every non-functional module
  const bits = [];
  for (const b of enc.seq) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  const dataPos = [];
  let col = n - 1, up = true;
  while (col > 0) {
    if (col === 6) col--;
    for (let k = 0; k < n; k++) {
      const r = up ? n - 1 - k : k;
      for (const c of [col, col - 1]) if (!fn[r][c]) dataPos.push([r, c]);
    }
    col -= 2; up = !up;
  }
  const putData = (maskFn) => {
    let i = 0;
    for (const [r, c] of dataPos) {
      let bit = i < bits.length ? bits[i] : 0; i++;
      mod[r][c] = maskFn ? (bit ^ (maskFn(r, c) ? 1 : 0)) === 1 : !!bit;
    }
  };
  const putFormat = (maskId) => {
    const fbits = getBCH((0 << 3) | maskId); // level M = 00 → format data (2 bits)<<3|mask
    for (let i = 0; i < 15; i++) {
      const b = ((fbits >> i) & 1) === 1;
      if (i < 6) { fn[i][8] = true; mod[i][8] = b; }
      else if (i < 8) { fn[i + 1][8] = true; mod[i + 1][8] = b; }
      else { fn[n - 15 + i][8] = true; mod[n - 15 + i][8] = b; }
      if (i < 8) { fn[8][n - i - 1] = true; mod[8][n - i - 1] = b; }
      else if (i === 8) { fn[8][7] = true; mod[8][7] = b; }
      else { fn[8][15 - i - 1] = true; mod[8][15 - i - 1] = b; }
    }
    // (8,6) is the timing column — must stay dark (set by timing pass)
  };
  let best = null, bestPen = Infinity, bestMask = 0;
  for (let m = 0; m < 8; m++) {
    putData(MASKS[m]); putFormat(m);
    const pen = penalty(mod, n);
    if (pen < bestPen) { bestPen = pen; best = mod.map(r => r.slice()); bestMask = m; }
  }
  return { matrix: best, size: n, version: enc.version, mask: bestMask };
}
function penalty(m, s) {
  let pen = 0;
  // N1 runs
  for (let a = 0; a < s; a++) {
    let run = 1;
    for (let b = 1; b < s; b++) { if (m[a][b] === m[a][b - 1]) run++; else { if (run >= 5) pen += 3 + run - 5; run = 1; } }
    if (run >= 5) pen += 3 + run - 5;
    run = 1;
    for (let b = 1; b < s; b++) { if (m[b][a] === m[b - 1][a]) run++; else { if (run >= 5) pen += 3 + run - 5; run = 1; } }
    if (run >= 5) pen += 3 + run - 5;
  }
  // N2 blocks
  for (let r = 0; r < s - 1; r++) for (let c = 0; c < s - 1; c++)
    if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) pen += 3;
  // N3 patterns
  const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
  const pat2 = [false, false, false, false, true, false, true, true, true, false, true];
  const scan = (getter) => {
    for (let r = 0; r < s; r++) for (let c = 0; c < s; c++) {
      let ok = true, ok2 = true;
      for (let k = 0; k < 11 && (ok || ok2); k++) {
        const v = getter(r, c + k);
        if (v !== pat1[k]) ok = false;
        if (v !== pat2[k]) ok2 = false;
      }
      if (ok) pen += 40; if (ok2) pen += 40;
    }
  };
  scan((r, c) => (c < s ? m[r][c] : false));
  scan2: for (let c = 0; c < s; c++) for (let r = 0; r < s; r++) {
    let ok = true, ok2 = true;
    for (let k = 0; k < 11; k++) {
      const v = (r + k < s) ? m[r + k][c] : false;
      if (v !== pat1[k]) ok = false;
      if (v !== pat2[k]) ok2 = false;
    }
    if (ok) pen += 40; if (ok2) pen += 40;
  }
  // N4 dark ratio
  let dark = 0; for (const row of m) for (const v of row) if (v) dark++;
  const pct = (dark / (s * s)) * 100;
  pen += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return pen;
}
function qrSVG(bytes) {
  const q = qrMatrix(bytes);
  if (!q) return null;
  const quiet = 4, s = q.size + quiet * 2;
  let rects = '';
  for (let r = 0; r < q.size; r++) for (let c = 0; c < q.size; c++)
    if (q.matrix[r][c]) rects += `<rect x="${c + quiet}" y="${r + quiet}" width="1" height="1"/>`;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s * 6}" height="${s * 6}" shape-rendering="crispEdges"><rect width="${s}" height="${s}" fill="#ffffff"/><g fill="#0a0f1c">${rects}</g></svg>`, version: q.version, mask: q.mask, size: q.size };
}
/* Arabic text is 2 bytes/char in UTF-8 — trim by BYTES, never splitting a codepoint */
function utf8Trim(s, maxBytes) {
  let out = String(s == null ? '' : s).trim();
  while (out.length > 0 && Buffer.byteLength(out, 'utf8') > maxBytes) out = out.slice(0, -1);
  return out;
}
const QR_BYTES_CAP = 106; // v6 @ level M fits ≤106 payload bytes
function sellerBudget(vatNo, stamp, totalS, vatS) {
  const fixed = (vatNo || '').length + stamp.length + totalS.length + vatS.length + 10; // +5×(tag+len)
  return Math.max(8, QR_BYTES_CAP - 3 - fixed); // 3 = mode+count overhead headroom
}
function invoiceTLV(inv, settings) {
  const vatNo = String((inv.clientSnapshot.vatNumber || settings.business.vatNumber || '').replace(/\D/g, ''));
  const ts = new Date(inv.issueDate && !isNaN(Date.parse(inv.issueDate)) ? inv.issueDate : nowISO());
  const stamp = ts.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const totalS = Number(inv.total).toFixed(2), vatS = Number(inv.vatTotal).toFixed(2);
  const raw = (settings.business.legalName || settings.business.name || 'Baran FatoraBox').trim();
  const seller = utf8Trim(raw, sellerBudget(vatNo, stamp, totalS, vatS));
  return tlvBase64(seller || 'FatoraBox', vatNo, stamp, totalS, vatS);
}

/* ── validation ─────────────────────────────────────────── */
const clean = s => String(s == null ? '' : s).slice(0, 400).replace(/[\u0000-\u001F\u007F]/g, '');
function validInvoicePayload(b) {
  if (!b || typeof b !== 'object') return 'body';
  if (!Array.isArray(b.items) || b.items.length === 0 || b.items.length > 100) return 'items (1..100)';
  for (const it of b.items) {
    const q = Number(it.qty), p = Number(it.price);
    if (!isFinite(q) || q <= 0 || q > 1e9) return 'qty';
    if (!isFinite(p) || p < 0 || p > 1e12) return 'price';
    if (it.discountType && !['percent', 'amount'].includes(it.discountType)) return 'discountType';
    if (['percent', 'amount'].includes(it.discountType) && !(Number(it.discountValue) >= 0)) return 'discountValue';
    const r = Number(it.vatRate);
    if (!isFinite(r) || r < 0 || r > 100) return 'vatRate';
  }
  return null;
}

/* ── router ─────────────────────────────────────────────── */
const routes = [];
const route = (method, re, fn) => routes.push({ method, re, fn });

route('GET', /^\/api\/health$/, (req, res) => json(res, 200, { ok: true, name: NAME, version: VERSION, lang: db.settings.lang, auth: !!db.authHash, port: PORT }));
route('GET', /^\/api\/policy$/, (req, res) => json(res, 200, {
  product: NAME, license: 'MIT core + personal/commercial-use for buyer',
  zatca: 'Phase-1 (TLV QR) computed locally; Phase-2 integration is NOT included',
  data: '100% local (data/db.json). Nothing leaves the box. No telemetry, no cloud, no subscription.',
  support: '1 year bug fixes — baranavisat@gmail.com · WhatsApp +90 531 326 37 22',
  takedown: 'email baranavisat@gmail.com — response ≤72h',
}));
route('GET', /^\/api\/stats$/, (req, res) => {
  const t = new Date(), m = t.toISOString().slice(0, 7);
  let mtd = 0, vatOut = 0, overdue = 0, openTotal = 0, paidCount = 0, avg = 0, paidTotal = 0;
  const byClient = new Map();
  for (const inv of db.invoices) {
    if (inv.status === 'void') continue;
    const paid = inv.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    if (inv.status === 'paid' || paid >= inv.total - 0.01) {
      paidCount++; paidTotal += inv.total;
      const k = inv.clientSnapshot.name || '—';
      byClient.set(k, (byClient.get(k) || 0) + inv.total);
    } else {
      openTotal += inv.total - paid;
      vatOut += inv.vatTotal;
      if (inv.dueDate && inv.dueDate.slice(0, 10) < nowISO().slice(0, 10) && ['sent', 'partial'].includes(inv.status)) overdue++;
    }
    if ((inv.issueDate || '').slice(0, 7) === m) mtd += inv.total;
    for (const p of inv.payments) if ((p.date || '').slice(0, 7) === m) mtd += 0; // payments counted via totals above
  }
  const months = {};
  for (const inv of db.invoices) {
    if (inv.status === 'void') continue;
    const k = (inv.issueDate || '').slice(0, 7);
    if (k) months[k] = (months[k] || 0) + inv.total;
  }
  const top = [...byClient.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, total]) => ({ name, total: round2(total) }));
  avg = paidCount ? round2(paidTotal / paidCount) : 0;
  json(res, 200, { ok: true, mtdTotal: round2(mtd), vatOutstanding: round2(vatOut), overdueCount: overdue, openTotal: round2(openTotal), paidCount, avgInvoice: avg, topClients: top, months });
});
route('GET', /^\/api\/settings$/, (req, res) => json(res, 200, { ok: true, settings: db.settings, authActive: !!db.authHash }));
route('PUT', /^\/api\/settings$/, (req, res, u, body) => {
  const b = body || {};
  const s = JSON.parse(JSON.stringify(db.settings));
  if (b.business) for (const k of Object.keys(s.business)) s.business[k] = clean(b.business[k]).slice(0, 300);
  if (b.vat) { s.vat.preset = clean(b.vat.preset).slice(0, 8) || 'KSA'; s.vat.rate = Math.min(100, Math.max(0, Number(b.vat.rate) || 0)); }
  if (b.currency != null) s.currency = clean(b.currency).slice(0, 6) || 'SAR';
  if (b.invoicePrefix != null) s.invoicePrefix = clean(b.invoicePrefix).slice(0, 12) || 'INV';
  if (b.terms != null) s.terms = clean(b.terms).slice(0, 900);
  if (b.lang != null) s.lang = ['ar', 'en', 'tr'].includes(b.lang) ? b.lang : 'ar';
  saveDB({ ...db, settings: s });
  json(res, 200, { ok: true, settings: s });
});
route('POST', /^\/api\/auth\/lock$/, (req, res, u, body) => {
  const code = clean(body && body.code);
  if (db.authHash) return bad(res, 'passcode already set — cannot change via API (edit data/db.json manually)', 403);
  if (code.length < 4) return bad(res, 'passcode must be ≥4 chars');
  saveDB({ ...db, authHash: sha256(code) });
  json(res, 200, { ok: true, authActive: true });
});
route('DELETE', /^\/api\/admin\/reset$/, (req, res) => {
  // keeps settings + passcode, wipes operating data
  saveDB({ ...db, seq: 0, clients: [], invoices: [] });
  json(res, 200, { ok: true, cleared: true });
});

route('GET', /^\/api\/clients$/, (req, res) => json(res, 200, { ok: true, clients: db.clients.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }));
route('POST', /^\/api\/clients$/, (req, res, u, b) => {
  const name = clean(b && b.name).trim();
  if (!name) return bad(res, 'name required');
  const vat = clean(b.vatNumber).replace(/\D/g, '');
  if (vat && vat.length !== 15) return bad(res, 'VAT number must be exactly 15 digits (ZATCA format)');
  const c = { id: id('cl'), name, vatNumber: vat, email: clean(b.email), phone: clean(b.phone), address: clean(b.address), notes: clean(b.notes), createdAt: nowISO() };
  db.clients.push(c); saveDB(db);
  json(res, 200, { ok: true, client: c });
});
route('PUT', /^\/api\/clients\/([A-Za-z0-9]+)$/, (req, res, m, b) => {
  const c = db.clients.find(x => x.id === m[1]);
  if (!c) return bad(res, 'client not found', 404);
  if (b) {
    if (b.name != null) c.name = clean(b.name).trim() || c.name;
    if (b.vatNumber != null) { const v = clean(b.vatNumber).replace(/\D/g, ''); if (v && v.length !== 15) return bad(res, 'VAT must be 15 digits'); c.vatNumber = v; }
    for (const k of ['email', 'phone', 'address', 'notes']) if (b[k] != null) c[k] = clean(b[k]);
  }
  saveDB(db); json(res, 200, { ok: true, client: c });
});
route('DELETE', /^\/api\/clients\/([A-Za-z0-9]+)$/, (req, res, m) => {
  if (!db.clients.some(x => x.id === m[1])) return bad(res, 'client not found', 404);
  db.clients = db.clients.filter(x => x.id !== m[1]);
  saveDB(db); json(res, 200, { ok: true });
});

route('GET', /^\/api\/invoices$/, (req, res, u, body, q) => {
  let list = db.invoices.slice().sort((a, b) => (b.issueDate + b.number).localeCompare(a.issueDate + a.number));
  const status = q.get('status'), term = (q.get('q') || '').toLowerCase();
  if (status) list = list.filter(x => x.status === status);
  if (term) list = list.filter(x => (x.number + ' ' + x.clientSnapshot.name + ' ' + (x.notes || '')).toLowerCase().includes(term));
  json(res, 200, { ok: true, count: list.length, invoices: list });
});
route('POST', /^\/api\/invoices$/, (req, res, u, body) => {
  const err = validInvoicePayload(body);
  if (err) return bad(res, 'invalid invoice payload: ' + err);
  const client = db.clients.find(c => c.id === body.clientId) || null;
  const cid = crypto.randomBytes(4).toString('hex');
  const items = body.items.map(it => ({
    desc: clean(it.desc).slice(0, 300) || 'بند',
    qty: round2(Number(it.qty)), price: round2(Number(it.price)),
    vatRate: Number(it.vatRate) || 0,
    discountType: it.discountType || null,
    discountValue: Number(it.discountValue) || 0,
  }));
  const t = computeTotals(items);
  db.seq += 1;
  const inv = {
    id: 'inv' + cid, number: `${db.settings.invoicePrefix}-${new Date().getFullYear()}-${String(db.seq).padStart(4, '0')}`,
    clientId: client ? client.id : null,
    clientSnapshot: {
      name: clean(body.clientNameOverride).trim() || (client ? client.name : 'عميل نقدي'),
      vatNumber: client ? (client.vatNumber || '') : clean(body.clientVatOverride || '').replace(/\D/g, ''),
      address: client ? (client.address || '') : clean(body.clientAddressOverride || ''),
      email: client ? (client.email || '') : '', phone: client ? (client.phone || '') : '',
    },
    items, status: 'draft', currency: clean(body.currency) || db.settings.currency,
    issueDate: clean(body.issueDate) || nowISO().slice(0, 10),
    dueDate: clean(body.dueDate) || '',
    notes: clean(body.notes), lang: ['ar', 'en', 'tr'].includes(body.lang) ? body.lang : db.settings.lang,
    subtotal: t.subtotal, vatTotal: t.vatTotal, total: t.total,
    payments: [], tlv: null, createdAt: nowISO(),
  };
  inv.tlv = invoiceTLV(inv, db.settings);
  db.invoices.push(inv); saveDB(db);
  json(res, 200, { ok: true, invoice: inv });
});
route('GET', /^\/api\/invoices\/([A-Za-z0-9]+)$/, (req, res, m) => {
  const inv = db.invoices.find(x => x.id === m[1]);
  if (!inv) return bad(res, 'invoice not found', 404);
  json(res, 200, { ok: true, invoice: inv });
});
route('PATCH', /^\/api\/invoices\/([A-Za-z0-9]+)$/, (req, res, m, b) => {
  const inv = db.invoices.find(x => x.id === m[1]);
  if (!inv) return bad(res, 'invoice not found', 404);
  const s = clean(b && b.status);
  if (!['draft', 'sent', 'partial', 'paid', 'void'].includes(s)) return bad(res, 'bad status');
  inv.status = s; saveDB(db);
  json(res, 200, { ok: true, invoice: inv });
});
route('PUT', /^\/api\/invoices\/([A-Za-z0-9]+)$/, (req, res, m, body) => {
  const inv = db.invoices.find(x => x.id === m[1]);
  if (!inv) return bad(res, 'invoice not found', 404);
  if (inv.status === 'paid') return bad(res, 'paid invoices are locked', 403);
  const err = validInvoicePayload(body);
  if (err) return bad(res, 'invalid payload: ' + err);
  const client = db.clients.find(c => c.id === body.clientId) || null;
  inv.items = body.items.map(it => ({
    desc: clean(it.desc).slice(0, 300) || 'بند',
    qty: round2(Number(it.qty)), price: round2(Number(it.price)),
    vatRate: Number(it.vatRate) || 0,
    discountType: it.discountType || null, discountValue: Number(it.discountValue) || 0,
  }));
  if (client) inv.clientId = client.id;
  inv.clientSnapshot = {
    name: clean(body.clientNameOverride).trim() || (client ? client.name : 'عميل نقدي'),
    vatNumber: client ? (client.vatNumber || '') : clean(body.clientVatOverride || '').replace(/\D/g, ''),
    address: client ? (client.address || '') : clean(body.clientAddressOverride || ''),
    email: client ? (client.email || '') : '', phone: client ? (client.phone || '') : '',
  };
  if (body.issueDate) inv.issueDate = clean(body.issueDate);
  if (body.dueDate != null) inv.dueDate = clean(body.dueDate);
  if (body.notes != null) inv.notes = clean(body.notes);
  if (body.currency) inv.currency = clean(body.currency).slice(0, 6);
  const t = computeTotals(inv.items);
  inv.subtotal = t.subtotal; inv.vatTotal = t.vatTotal; inv.total = t.total;
  const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
  if (inv.status !== 'void' && inv.status !== 'draft')
    inv.status = paid >= inv.total - 0.009 ? 'paid' : (paid > 0 ? 'partial' : 'sent');
  inv.tlv = invoiceTLV(inv, db.settings);
  saveDB(db); json(res, 200, { ok: true, invoice: inv });
});
route('DELETE', /^\/api\/invoices\/([A-Za-z0-9]+)$/, (req, res, m) => {
  const inv = db.invoices.find(x => x.id === m[1]);
  if (!inv) return bad(res, 'not found', 404);
  if (inv.status !== 'draft') { inv.status = 'void'; saveDB(db); return json(res, 200, { ok: true, voided: true, invoice: inv }); }
  db.invoices = db.invoices.filter(x => x.id !== inv.id);
  saveDB(db); json(res, 200, { ok: true, deleted: true });
});
route('POST', /^\/api\/payments$/, (req, res, u, b) => {
  const inv = db.invoices.find(x => x.id === (b && b.invoiceId));
  if (!inv) return bad(res, 'invoice not found', 404);
  if (inv.status === 'void') return bad(res, 'voided invoice', 403);
  const amount = round2(Number(b.amount));
  const total = Number(inv.total);
  if (!(amount > 0) || Math.abs(amount - total) < 0.001) return bad(res, 'amount must be >0 and < total (use status paid for full settlement)');
  const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
  if (paid + amount > total + 0.001) return bad(res, `exceeds remaining ${round2(total - paid)}`);
  inv.payments.push({ id: id('pm'), date: clean(b.date) || nowISO().slice(0, 10), amount, method: clean(b.method).slice(0, 40) || 'cash', note: clean(b.note).slice(0, 200) });
  inv.status = paid + amount >= total - 0.009 ? 'paid' : 'partial';
  saveDB(db); json(res, 200, { ok: true, invoice: inv });
});
route('GET', /^\/api\/qr\/([A-Za-z0-9]+)$/, (req, res, m) => {
  const inv = db.invoices.find(x => x.id === m[1]);
  if (!inv) return bad(res, 'not found', 404);
  if (!inv.tlv) return bad(res, 'no TLV on this invoice (missing VAT number?)', 400);
  const bytes = Buffer.from(inv.tlv, 'base64');
  const q = qrSVG(bytes);
  if (!q) return bad(res, 'payload too long for QR', 400);
  json(res, 200, { ok: true, tlv: inv.tlv, svg: q.svg, version: q.version, size: q.size, mask: q.mask });
});
route('GET', /^\/api\/tlv$/, (req, res, u, body, q) => {
  // testing + manual utility — seller auto-trims by bytes so the QR always fits
  const vat = (q.get('vat') || '').replace(/\D/g, '');
  const stamp = clean(q.get('ts') || nowISO());
  const totalS = Number(q.get('total') || 0).toFixed(2);
  const vatS = Number(q.get('vatTotal') || 0).toFixed(2);
  const seller = utf8Trim(clean(q.get('seller') || ''), sellerBudget(vat, stamp, totalS, vatS)) || 'FatoraBox';
  const tlv = tlvBase64(seller, vat, stamp, totalS, vatS);
  if (!tlv) return bad(res, 'field too long (≤255 bytes each)');
  const out = qrSVG(Buffer.from(tlv, 'base64'));
  json(res, 200, { ok: true, tlv, ...(out ? { svg: out.svg, version: out.version, mask: out.mask, size: out.size } : { qr: null }) });
});
route('GET', /^\/export\/invoices\.csv$/, (req, res) => {
  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = [['number', 'status', 'date', 'due', 'client', 'clientVAT', 'currency', 'subtotal', 'vat', 'total', 'paid', 'remaining']];
  for (const i of db.invoices) {
    const paid = round2(i.payments.reduce((s, p) => s + p.amount, 0));
    rows.push([i.number, i.status, i.issueDate, i.dueDate, i.clientSnapshot.name, i.clientSnapshot.vatNumber, i.currency, i.subtotal, i.vatTotal, i.total, paid, round2(i.total - paid)]);
  }
  headersCSP(res);
  res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="fatorabox-invoices.csv"' });
  res.end('\uFEFF' + rows.map(r => r.map(esc).join(',')).join('\n'));
});
route('GET', /^\/api\/backup$/, (req, res) => {
  headersCSP(res);
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="fatorabox-backup-${nowISO().slice(0, 10)}.json"` });
  res.end(JSON.stringify(db, null, 1));
});

/* ── static files (path-safe) ───────────────────────────── */
const STATIC_TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8' };
const STATIC_OK = new Set(Object.keys(STATIC_TYPES));
function serveStatic(pathname, res) {
  let p = pathname === '/' ? '/index.html' : pathname;
  const ext = path.extname(p).toLowerCase();
  if (!STATIC_OK.has(ext)) return false;
  const full = path.join(PUBLIC, path.normalize(p).replace(/^([.][.][\/\\])+/, ''));
  if (!full.startsWith(PUBLIC)) return false;
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return false;
  headersCSP(res);
  const sw = p === '/service-worker.js';
  const html = p === '/index.html';
  res.writeHead(200, { 'Content-Type': STATIC_TYPES[ext], 'Cache-Control': (sw || html) ? 'no-cache' : 'public, max-age=3600' });
  res.end(fs.readFileSync(full));
  return true;
}

/* ── server ─────────────────────────────────────────────── */
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '') || 'local';
  const isWrite = !['GET', 'HEAD'].includes(req.method);
  if (!rateOK(ip, isWrite ? 'post' : 'get')) return json(res, 429, { ok: false, error: 'rate limited' });
  if (req.method === 'OPTIONS') { headersCSP(res); res.writeHead(200, { Allow: 'GET,POST,PUT,PATCH,DELETE' }); return res.end(); }
  // read body (graceful 1MB cap: keep draining, never destroy mid-upload)
  let raw = '', oversize = false;
  req.on('data', d => {
    if (oversize) return;
    raw += d;
    if (raw.length > BODY_CAP) { oversize = true; raw = ''; }
  });
  req.on('error', () => { /* client aborts — response already impossible */ });
  req.on('end', () => {
    let body = null;
    if (oversize) return bad(res, 'body too large (1MB cap)', 413);
    if (raw) {
      try { body = JSON.parse(raw); } catch (e) { return bad(res, 'JSON body required', 400); }
    }
    const q = u.searchParams;
    if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/export/')) {
      if (isWrite && !authed(req)) return json(res, 401, { ok: false, error: 'locked — passcode required (X-Fatora-Code header)' });
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const match = r.re.exec(u.pathname);
        if (match) return r.fn(req, res, match, body, q);
      }
      return bad(res, 'unknown API endpoint', 404);
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (serveStatic(u.pathname, res)) return;
      if (u.pathname === '/data/db.json' || u.pathname.includes('db.json')) return bad(res, 'private data is never served', 403);
      headersCSP(res); res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<!doctype html><meta charset="utf-8"><title>404</title><p style="font:16px system-ui">404 — غير موجود</p>');
    }
    return bad(res, 'method not allowed', 405);
  });
});
server.listen(PORT, HOST, () => {
  console.log(`✔ ${NAME} v${VERSION} — http://${HOST}:${PORT} (lang=${db.settings.lang})`);
  console.log(`  auth:${db.authHash ? 'passcode ON' : 'off (bind ' + HOST + ')'} · invoices:${db.invoices.length} · zap: data/db.json`);
});
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
