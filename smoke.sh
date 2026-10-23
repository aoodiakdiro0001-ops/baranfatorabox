#!/usr/bin/env bash
# Baran FatoraBox smoke test — 16 checks against a throwaway instance on :3170.
# Usage: bash smoke.sh        (starts its own server; leaves nothing behind)
set -u
cd "$(dirname "$0")"
BASE="http://127.0.0.1:3170"
SHAS="http://127.0.0.1:3171"
DISTA="/tmp/fb-smoke-a.json"
DISTB="/tmp/fb-smoke-b.json"
rm -f "$DISTA" "$DISTB"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf "  ✓ %s\n" "$1"; }
bad()  { FAIL=$((FAIL+1)); printf "  ✗ %s\n" "$1"; }
claim(){ if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (expected [$3] got [$2])"; fi; }

# ── instance A: default (auth off, fresh data) ──
node --check server.js && ok "1. server.js syntax clean" || bad "1. syntax"
FATORA_DATA="$DISTA" PORT=3170 node server.js >/tmp/fb-smoke-a.log 2>&1 & PA=$!
FATORA_DATA="$DISTB" FATORA_PASSCODE=smoke1234 PORT=3171 node server.js >/tmp/fb-smoke-b.log 2>&1 & PB=$!
sleep 1.2

# 2. health
H=$(curl -s "$BASE/api/health")
case "$H" in *'"ok":true'*) ok "2. health responds ok";; *) bad "2. health: $H";; esac

# 3-5. security headers
tmp=$(mktemp)
curl -s -D"$tmp" -o /dev/null "$BASE/"
grep -qi "content-security-policy:.*default-src 'self'" "$tmp" && ok "3. CSP strict (no open sources)" || bad "3. CSP missing"
grep -qi "x-frame-options: DENY" "$tmp" && ok "4. X-Frame-Options DENY" || bad "4. XFO missing"
grep -qi "x-content-type-options: nosniff" "$tmp" && ok "5. nosniff" || bad "5. nosniff missing"

# 6. TLV known-vector match (python independent re-encode)
V=$(curl -s "$BASE/api/tlv?seller=Test%20Company&vat=300000000000003&total=115.00&vatTotal=15.00&ts=2026-10-23T20:15:00Z" \
  | python3 -c "
import json,sys,base64
d=json.load(sys.stdin)
def tlv():
    out=b''
    for t,v in [(1,b'Test Company'),(2,b'300000000000003'),(3,b'2026-10-23T20:15:00Z'),(4,b'115.00'),(5,b'15.00')]:
        out+=bytes([t,len(v)])+v
    return base64.b64encode(out).decode()
print('MATCH' if d.get('ok') and d.get('tlv')==tlv() and d.get('svg') else 'MISMATCH')")
claim "6. TLV matches hand-built vector + svg emitted" "$V" "MATCH"

# 7. QR decode selftest (independent spec-driven decoder)
python3 tools/qr_selftest.py "$BASE" >/tmp/fb-smoke-qr.log 2>&1 && ok "7. QR decode selftest (RS zero + byte-exact)" || bad "7. $(tail -2 /tmp/fb-smoke-qr.log | tr '\n' ' ')"

# 8. seed a client + invoice with a % discount (server-authoritative pricing)
curl -s -X POST "$BASE/api/clients" -H 'Content-Type: application/json' \
  -d '{"name":"شركة التحقق","vatNumber":"300000000000003"}' >/dev/null
CID=$(curl -s "$BASE/api/clients" | python3 -c "import json,sys;print(json.load(sys.stdin)['clients'][0]['id'])")
INV=$(curl -s -X POST "$BASE/api/invoices" -H 'Content-Type: application/json' -d "{\"clientId\":\"$CID\",\"items\":[{\"desc\":\"x\",\"qty\":1,\"price\":500,\"vatRate\":15,\"discountType\":\"percent\",\"discountValue\":10}]}")
NUM=$(echo "$INV" | python3 -c "import json,sys;d=json.load(sys.stdin);i=d['invoice'];print(i['number'],i['subtotal'],i['vatTotal'],i['total'])")
claim "8. pricing: 10% disc → 450/67.5/517.5" "$NUM" "INV-2026-0001 450 67.5 517.5"
IID=$(echo "$INV" | python3 -c "import json,sys;print(json.load(sys.stdin)['invoice']['id'])")

# 9. partial payment → status partial
P=$(curl -s -X POST "$BASE/api/payments" -H 'Content-Type: application/json' -d "{\"invoiceId\":\"$IID\",\"amount\":100,\"method\":\"cash\"}" | python3 -c "import json,sys;d=json.load(sys.stdin);print('OK' if d.get('ok') and d['invoice']['status']=='partial' else 'NO')")
claim "9. partial payment → status=partial" "$P" "OK"

# 10. overpay rejected
O=$(curl -s -X POST "$BASE/api/payments" -H 'Content-Type: application/json' -d "{\"invoiceId\":\"$IID\",\"amount\":99999}" -o /dev/null -w '%{http_code}')
claim "10. overpay → 400" "$O" "400"

# 11. settle → paid, then edit locked (403)
curl -s -X PATCH "$BASE/api/invoices/$IID" -H 'Content-Type: application/json' -d '{"status":"paid"}' >/dev/null
L=$(curl -s -X PUT "$BASE/api/invoices/$IID" -H 'Content-Type: application/json' -d '{"items":[{"desc":"y","qty":1,"price":1}]}' -o /dev/null -w '%{http_code}')
claim "11. paid invoice edit locked → 403" "$L" "403"

# 12. 1MB body cap (stdin pipe — avoids shell argv limits)
C=$(python3 -c "print('{\"name\":\"' + 'a'*1300000 + '\"}')" | curl -s -X POST "$BASE/api/clients" -H 'Content-Type: application/json' --data-binary @- -o /dev/null -w '%{http_code}')
claim "12. 1.3MB body rejected" "$C" "413"

# 13. db.json never served
D=$(curl -s "$BASE/data/db.json" -o /dev/null -w '%{http_code}')
claim "13. db.json blocked → 403" "$D" "403"

# 14. CSV export
V14=$(curl -s "$BASE/export/invoices.csv" -o /dev/null -w '%{http_code}')
claim "14. CSV export → 200" "$V14" "200"

# 15. JSON backup
V15=$(curl -s "$BASE/api/backup" -o /dev/null -w '%{http_code}')
claim "15. JSON backup → 200" "$V15" "200"

# 16. passcode instance: write without code → 401, with code → 200
A=$(curl -s -X POST "$SHAS/api/clients" -H 'Content-Type: application/json' -d '{"name":"n"}' -o /dev/null -w '%{http_code}')
B=$(curl -s -X POST "$SHAS/api/clients" -H 'Content-Type: application/json' -H 'X-Fatora-Code: smoke1234' -d '{"name":"n"}' -o /dev/null -w '%{http_code}')
if [ "$A" = "401" ] && [ "$B" = "200" ]; then ok "16. passcode gate: no-code 401 / with-code 200"; else bad "16. passcode gate ($A/$B — expected 401/200)"; fi

kill $PA $PB 2>/dev/null
wait $PA $PB 2>/dev/null
echo "──────────────────────────────"
echo "SMOKE: $PASS passed, $FAIL failed"
exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
