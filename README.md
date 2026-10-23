# 🧾 Baran FatoraBox v1.0.0

**Arabic-first self-hosted invoicing OS** — the whole shop in one Node file.

| | |
|---|---|
| Language | Arabic (default) · Turkish · English — full RTL |
| Engine | One `server.js`, **zero dependencies** (Node ≥16 built-ins only) |
| QR | ZATCA (Saudi) Phase‑1 TLV QR — generated locally, decoded byte-exact |
| Storage | `data/db.json` — nothing leaves the box, no telemetry, no cloud |
| Offline | PWA (installable app + offline shell) |
| Lock | Optional passcode (SHA-256, timing-safe compare) for every mutating call |
| Currency tax presets | KSA 15% · TR 20% · EG 14% · AE 5% · BH 10% · OM 5% · QA 5% · KW 0% · JO 16% |
| UI | Dashboard (sales chart, top clients, overdue), invoices (server-authoritative pricing, %/amount discounts, partial payments), clients, settings, printable A4 sheet → PDF |
| Port | `3160` (set `PORT=` to move) |

## Run

```bash
node server.js
# → ✔ Baran FatoraBox v1.0.0 — http://127.0.0.1:3160
```

That's it. No `npm install`. Node.js is the only dependency.

## API surface

```
GET    /api/health              liveness + version
GET    /api/stats               MTD, VAT outstanding, overdue, 6-month chart, top clients
GET/PUT /api/settings           business info, VAT preset/rate, currency, language
GET/POST /api/clients           clients (name, VAT# 15, phone, email, address)
GET/POST /api/invoices          invoices — server computes subtotal/VAT/total
GET/PUT/PATCH/DELETE /api/invoices/:id   draft→sent→(partial)→paid, void
POST   /api/payments            partial payments (overpay → 400)
GET    /api/qr/:id              ZATCA TLV + QR SVG for one invoice
GET    /api/tlv                 TLV+QR utility (used by the self-test)
GET    /export/invoices.csv     full export
GET    /api/backup              JSON snapshot download
POST   /api/auth/lock           set passcode (one-way; once set, keep the JSON safe)
DELETE /api/admin/reset         wipe operating data (keeps settings + lock)
```

Paid invoices are **locked** (edit → `403`). Invoices can't be silently shrunk after payment.

## Environment

| var | effect |
|---|---|
| `PORT=3160` | listen port |
| `FATORA_BIND_ALL=1` | bind `0.0.0.0` (default `127.0.0.1`) |
| `FATORA_DATA=/path/db.json` | custom database location (portable installs) |
| `FATORA_PASSCODE=…` | operator passcode — **always wins on boot** (overrides UI-set code; hash is SHA-256) |

## Verifying the QR (the honest way)

This repo ships its own referee:

```bash
node server.js &                 # on :3160
python3 tools/qr_selftest.py     # independent spec-driven QR decoder, zero deps
```

The self-test decodes the server's own SVG through a from-scratch pipeline
(format-info BCH → unmask → zigzag → de-interleave → **Reed–Solomon syndromes** →
bitstream) and requires byte-exact TLV payloads. On this machine the same QRs
were additionally decoded by **Apple Vision** (`VNBarcodeSymbologyQR`) byte-exact,
including an Arabic-seller v6 payload with 4 interleaved blocks.

```bash
bash smoke.sh    # 16 checks: headers, TLV vector, pricing, payments, caps, lock
```

## Layout

```
server.js           the whole engine (HTTP + TLV + QR + Reed-Solomon + SVG)
public/             UI (index.html, css, js, PWA manifest, service worker, icons)
tools/make_icons.py icon generator (pure python, zero deps)
tools/qr_selftest.py independent QR decoder / verification harness
smoke.sh            16-check smoke test
docs/               policy notes + screenshots
```

## Why no QR library?

Because the ZATCA payload is small and fixed, and a hand-rolled ISO-18004 encoder
(v1–v6, ECC M) in ~90 lines of pure JS is auditable line-by-line — no supply
chain, no telemetry, no surprises. The Reed–Solomon generator is proven by
syndromes = 0 on every block, two ways (in-decoder + Apple Vision).

---

**Baran Avisat** — Professional Programmer · baranavisat@gmail.com · +90 531 326 37 22 ·
WhatsApp wa.me/905313263722 · GitHub [aoodiakdiro0001-ops](https://github.com/aoodiakdiro0001-ops)

Consulting: 1 year email/WhatsApp support included with the paid Gumroad edition.
