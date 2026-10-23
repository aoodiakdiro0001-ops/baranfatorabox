#!/usr/bin/env python3
"""Baran FatoraBox icon generator — pure-python PNG (zero dependencies).
Simple receipt-with-QR mark on the FatoraBox dark palette."""
import struct, zlib, os

def png_write(path, w, h, rgba_rows_bytes):
    sig = b'\x89PNG\r\n\x1a\n'
    def chunk(t, dat):
        return struct.pack('>I', len(dat)) + t + dat + struct.pack('>I', zlib.crc32(t + dat) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat = zlib.compress(b''.join(b'\x00' + bytes(r) for r in rgba_rows_bytes), 9)
    open(path, 'wb').write(sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b''))

BG    = (10, 15, 28, 255)      # #0a0f1c
PAPER = (238, 243, 250, 255)
ACC   = (79, 140, 255, 255)
INK   = (16, 26, 44, 255)
MUT   = (108, 124, 152, 255)

def icon(s):
    grid = [[BG] * s for _ in range(s)]

    def rrect(x0, y0, x1, y1, col, r=0):
        r = min(r, (x1 - x0) // 2, (y1 - y0) // 2)
        for y in range(max(0, y0), min(s, y1)):
            for x in range(max(0, x0), min(s, x1)):
                dx = max(0, x0 + r - x, x - (x1 - 1 - r))
                dy = max(0, y0 + r - y, y - (y1 - 1 - r))
                if dx * dx + dy * dy <= r * r:
                    grid[y][x] = col

    def rrect_xor(x0, y0, x1, y1, col, r=0):
        rrect(x0, y0, x1, y1, col, r)

    rrect(0, 0, s, s, BG, r=s // 10)
    m = s // 6
    rrect(m, s // 10, s - m, s * 9 // 10, PAPER, r=max(3, s // 40))
    rrect(m + 2, s // 10 + 2, s - m - 2, s // 10 + s // 18, ACC, r=max(2, s // 80))  # header strip
    ink_lines = ((0.62, 0), (0.46, 1), (0.70, 2), (0.55, 3))
    bw = max(2, s // 70)
    for wf, i in ink_lines:
        y0 = s * 40 // 100 + i * (s // 12)
        x0 = m + s // 22
        rrect(x0, y0, x0 + int((s - 2 * m - s // 11) * wf), y0 + bw, MUT)
    # QR block on paper bottom-right
    qs = int((s - 2 * m) * 0.42)
    qx0 = s - m - s // 14 - qs
    qy0 = s * 9 // 10 - s // 18 - qs
    rrect(qx0, qy0, qx0 + qs, qy0 + qs, INK, r=max(2, s // 90))
    cell = max(2, qs // 9)
    def finder(cx, cy):
        base_x = qx0 + s // 70 + cx * cell * 3
        base_y = qy0 + s // 70 + cy * cell * 3
        for dy in range(3):
            for dx in range(3):
                if (dx == 1 and dy == 1) or (dx == 1 and dy != 1 and False):
                    continue
                rrect(base_x + dx * cell, base_y + dy * cell, base_x + dx * cell + cell, base_y + dy * cell + cell, PAPER)
    for (cx, cy) in ((0, 0), (2, 0), (0, 2)):
        finder(cx, cy)
    dots = [(3, 0), (1, 1), (4, 1), (2, 3), (1, 4), (3, 4), (2, 2), (1, 3), (3, 2)]
    for (gx, gy) in dots:
        rrect(qx0 + s // 70 + gx * cell, qy0 + s // 70 + gy * cell,
              qx0 + s // 70 + gx * cell + cell, qy0 + s // 70 + gy * cell + cell, PAPER)
    return grid

if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    icons = os.path.join(here, '..', 'public', 'icons')
    os.makedirs(icons, exist_ok=True)
    for sz in (512, 192, 180, 32):
        grid = icon(sz)
        rows = []
        for row in grid:
            b = bytearray()
            for px in row:
                b += bytes(px)
            rows.append(b)
        png_write(os.path.join(icons, 'icon-%d.png' % sz), sz, sz, rows)
        print('icon-%d.png ok' % sz)
