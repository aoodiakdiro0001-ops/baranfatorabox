#!/usr/bin/env python3
"""Baran FatoraBox QR self-test — spec-driven diagnostic decoder (zero dependencies).

Decodes the server's own QR SVG output through an INDEPENDENT pipeline:
matrix load → format-info BCH → unmask → zigzag → de-interleave → Reed-Solomon
syndromes → bitstream parse → byte-exact TLV compare. Zero syndromes on every
block plus an exact payload match proves the encoder correct — no external
QR library involved anywhere.

Usage: python3 tools/qr_selftest.py [base_url]      (default http://127.0.0.1:3160)
Exit 0 = all samples byte-exact.
"""
import base64
import json
import re
import sys
import urllib.request

# ---- GF(256), prime 0x11D ----
GF_EXP = [0] * 512
GF_LOG = [0] * 256
_x = 1
for i in range(255):
    GF_EXP[i] = _x
    GF_LOG[_x] = i
    _x <<= 1
    if _x & 0x100:
        _x ^= 0x11D
for i in range(255, 512):
    GF_EXP[i] = GF_EXP[i - 255]


def gf_mul(a, b):
    return 0 if (a == 0 or b == 0) else GF_EXP[GF_LOG[a] + GF_LOG[b]]


# per-version layout @M: (blocks, dataCW_perBlock, ecPerBlock) — ISO 18004
LAYOUT = {1: (1, 16, 10), 2: (1, 28, 16), 3: (1, 44, 26),
          4: (2, 32, 18), 5: (2, 43, 24), 6: (4, 27, 16)}
G15 = 0b10100110111  # 0x537


def gmod(v):
    gd = G15.bit_length() - 1
    while v and (v.bit_length() - 1) >= gd:
        v ^= G15 << ((v.bit_length() - 1) - gd)
    return v


MASKS = [
    lambda r, c: (r + c) % 2 == 0,
    lambda r, c: r % 2 == 0,
    lambda r, c: c % 3 == 0,
    lambda r, c: (r + c) % 3 == 0,
    lambda r, c: (r // 2 + c // 3) % 2 == 0,
    lambda r, c: (r * c) % 2 + (r * c) % 3 == 0,
    lambda r, c: ((r * c) % 2 + (r * c) % 3) % 2 == 0,
    lambda r, c: ((r + c) % 2 + (r * c) % 3) % 2 == 0,
]


def load_matrix(svg):
    s = int(re.search(r'viewBox="0 0 (\d+) (\d+)"', svg).group(1))
    dark = [[False] * s for _ in range(s)]
    for x, y in re.findall(r'<rect x="(\d+)" y="(\d+)" width="1" height="1"', svg):
        dark[int(y)][int(x)] = True
    n = s - 8  # strip quiet zone 4
    return [[dark[r + 4][c + 4] for c in range(n)] for r in range(n)], n


def read_format(mat, n):
    f1 = [mat[i][8] for i in range(6)] + [mat[7][8], mat[8][8], mat[8][7]] + \
         [mat[8][14 - i] for i in range(9, 15)]
    f2 = [mat[8][n - 1 - i] for i in range(8)] + \
         [mat[n - 15 + i][8] for i in range(8, 15)]
    outs = []
    for name, bits in (('copy1', f1), ('copy2', f2)):
        val = 0
        for i, b in enumerate(bits):
            val |= (1 if b else 0) << i
        val ^= 0x5412
        outs.append((name, gmod(val) == 0, val >> 10))
    return outs


def functional_map(n, v):
    fn = [[False] * n for _ in range(n)]

    def mark(r, c):
        if 0 <= r < n and 0 <= c < n:
            fn[r][c] = True
    for (r0, c0) in ((0, 0), (0, n - 7), (n - 7, 0)):
        for r in range(-1, 8):
            for c in range(-1, 8):
                mark(r0 + r, c0 + c)
    for i in range(8, n - 8):
        mark(6, i)
        mark(i, 6)
    if v >= 2:
        a = 4 * v + 10
        for r in range(-2, 3):
            for c in range(-2, 3):
                mark(a + r, a + c)
    mark(n - 8, 8)
    for i in range(9):
        mark(8, i)
        mark(i, 8)
    for i in range(8):
        mark(8, n - 1 - i)
        mark(n - 1 - i, 8)
    return fn


def zigzag_read(mat, fn, n, mask):
    mf = MASKS[mask] if mask is not None else (lambda r, c: False)
    bits = []
    col, up = n - 1, True
    while col > 0:
        if col == 6:
            col -= 1
        for k in range(n):
            r = (n - 1 - k) if up else k
            for c in (col, col - 1):
                if not fn[r][c]:
                    bits.append(1 if (mat[r][c] ^ (1 if mf(r, c) else 0)) else 0)
        col -= 2
        up = not up
    return [int(''.join(str(b) for b in bits[i:i + 8]), 2)
            for i in range(0, len(bits) - 7, 8)]


def deinterleave(cw, blocks, cw_per, ec_per):
    data = [[0] * cw_per for _ in range(blocks)]
    ec = [[0] * ec_per for _ in range(blocks)]
    idx = 0
    for i in range(cw_per):
        for b in range(blocks):
            data[b][i] = cw[idx]
            idx += 1
    for i in range(ec_per):
        for b in range(blocks):
            ec[b][i] = cw[idx]
            idx += 1
    return data, ec


def rs_zero(data, ec):
    C = list(data) + list(ec)
    L = len(C)
    for j in range(len(ec)):
        S = 0
        for i, c in enumerate(C):
            if c:
                S ^= gf_mul(c, GF_EXP[(j * (L - 1 - i)) % 255])
        if S != 0:
            return False
    return True


def parse_payload(flat):
    bits = []
    for x in flat:
        for j in range(7, -1, -1):
            bits.append((x >> j) & 1)
    pos = 0

    def take(k):
        nonlocal pos
        v = 0
        for _ in range(k):
            v = (v << 1) | bits[pos]
            pos += 1
        return v
    mode = take(4)
    if mode != 4:
        return None
    count = take(8)
    if count == 0 or pos + count * 8 > len(bits):
        return None
    return bytes(take(8) for _ in range(count))


def analyze(svg, want):
    mat, n = load_matrix(svg)
    v = (n - 17) // 4
    blocks, cw_per, ec_per = LAYOUT[v]
    fmt = [f for f in read_format(mat, n) if f[1]]
    if not fmt:
        print('  FAIL: format BCH invalid in both copies')
        return False
    level, mask = fmt[0][2] >> 3, fmt[0][2] & 7
    if level != 0:
        print('  FAIL: ECC level != M')
        return False
    fn = functional_map(n, v)
    cw = zigzag_read(mat, fn, n, mask)
    if len(cw) != blocks * (cw_per + ec_per):
        print('  FAIL: codeword count %d != %d' % (len(cw), blocks * (cw_per + ec_per)))
        return False
    data, ec = deinterleave(cw, blocks, cw_per, ec_per)
    for b in range(blocks):
        if not rs_zero(data[b], ec[b]):
            print('  FAIL: RS syndromes nonzero in block %d' % b)
            return False
    flat = []
    for b in range(blocks):
        flat += data[b]
    payload = parse_payload(flat)
    if payload != want:
        print('  FAIL: payload mismatch (%r vs %r)' % (payload and payload[:24], want[:24]))
        return False
    print('  ok: v%d mask%d %d blocks → %d bytes byte-exact, RS zero ✓' % (v, mask, blocks, len(want)))
    return True


def main():
    base = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:3160').rstrip('/')
    samples = [
        ('std', dict(seller='Test Company', vat='300000000000003', total='115.00',
                     vatTotal='15.00', ts='2026-10-23T20:15:00Z')),
        ('arabic', dict(seller='شركة المعاقل التجارية للأغذية والمشروبات', vat='300000000000003',
                        total='944250.75', vatTotal='141637.61')),
        ('v1-small', dict(seller='Co', vat='300000000000003', total='5.00', vatTotal='0.75')),
    ]
    allok = True
    for name, q in samples:
        d = json.loads(urllib.request.urlopen(
            base + '/api/tlv?' + urllib.parse.urlencode(q), timeout=15).read())
        want = base64.b64decode(d['tlv'])
        if not d.get('svg'):
            print('[%s] FAIL: no svg emitted' % name)
            allok = False
            continue
        print('[%s] tlv=%dB' % (name, len(want)))
        allok = analyze(d['svg'], want) and allok
    print('QR SELFTEST:', 'ALL PASS ✅' if allok else 'FAILURES ❌')
    sys.exit(0 if allok else 1)


import urllib.parse  # noqa: E402

if __name__ == '__main__':
    main()
