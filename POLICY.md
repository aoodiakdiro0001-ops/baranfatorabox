# Baran FatoraBox — POLICY

*Last updated: 2026-10-23 · applies to version 1.0.x*

## 1. What this software is

A single-file self-hosted invoicing application ("the Software") you run on your
own machine. It generates invoices and a ZATCA Phase-1 TLV QR image to be printed
or shown on them.

## 2. What we do NOT do

- **No telemetry.** No code phones home. No analytics, no crash reporting.
- **No cloud.** Data lives in `data/db.json`. Network calls are only the HTTP you point at it.
- **No account.** No sign-up, subscription, or license server.

## 3. Your responsibilities

- Keep `data/db.json` backed up (Settings → JSON backup works offline).
- Passcode hashes are `sha256` in `db.json`; lose the file and the code is reset by deleting it.
- ZATCA Phase-2 (integration onboarding, electronic signing keys) is **not** implemented;
  stay informed of your tax authority's obligations.

## 4. Warranty & liability

Provided "as is", without warranty of any kind (MIT). You are the operator of this
software and are responsible for the accuracy of tax figures produced on your
invoices. Nobody at Baran Avisat can accept liability for your tax filings.

## 5. Refunds & support (Gumroad edition)

- Digital product; per Gumroad policy refunds are at the seller's discretion and up to 30 days.
- **1 year of support**: email baranavisat@gmail.com or WhatsApp +90 531 326 37 22.
- Feature requests are honored in order of demand, free within the license.

## 6. Redistribution

MIT license: you may modify and redistribute, keeping the copyright notice.
You may not rebrand it as your own paid product without substantial change and
disclosure. Support goes to buyers of record on Gumroad.

— Baran Avisat, Professional Programmer
