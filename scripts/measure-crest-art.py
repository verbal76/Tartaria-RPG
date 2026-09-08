#!/usr/bin/env python3
"""Measure the nine faction crests and print the CREST_ART table.

    python3 scripts/measure-crest-art.py

Paste the output into `app/engine/factionCrests.ts`. Re-run it after replacing
any crest artwork — `srcW`/`srcH` are checked against the real PNG headers by
ota1756, so a stale table fails CI rather than drifting quietly.

⚠⚠ WHY THIS EXISTS IN THIS FORM. It replaces `scripts/measure-crest-focus.html`,
which drew each crest to a 128x128 canvas and weighted pixels by
`alpha * max(0, luminance - 0.18)`. Two problems, and the second one shipped a
wrong table:

  1. It needed a browser and a local web server (canvas readback is blocked on
     file://), so in practice the measurement was hard to repeat.
  2. THE 0.18 THRESHOLD WAS A MAGIC NUMBER THAT CHANGED THE ANSWER. Discounting
     dim ink drags the centroid toward the brightest part of the artwork, which
     pushed every focusY too high — by 0.013 on forgotten_order and by 0.061 on
     true_tartarians. The emblems then sat too low on the card, which is the
     complaint that started all of this.

⚠⚠⚠ THE WEIGHTING HERE IS ALPHA x LUMINANCE, AND THAT IS NOT A TASTE CALL. The
watermark is composited at low opacity over a dark plate, so a pixel's
contribution to what a player actually sees is exactly its alpha times its
brightness. There is no threshold to tune and no parameter to get wrong.

The decoder below is deliberately dependency-free: this environment has no
Pillow, no numpy and no image tooling, and a measurement whose harness cannot
be run is a measurement nobody can check.
"""
import os
import struct
import sys
import zlib

CRESTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'crests')


def read_rgba(path):
    """Decode an 8-bit RGB/RGBA non-interlaced PNG. -> (w, h, bytearray RGBA)."""
    raw = open(path, 'rb').read()
    if raw[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError(f'{path}: not a PNG')
    pos, idat, w, h, ct = 8, bytearray(), None, None, None
    while pos < len(raw):
        (ln,) = struct.unpack('>I', raw[pos:pos + 4])
        typ, data = raw[pos + 4:pos + 8], raw[pos + 8:pos + 8 + ln]
        pos += 12 + ln
        if typ == b'IHDR':
            w, h, bd, ct, _cm, _fl, il = struct.unpack('>IIBBBBB', data)
            if bd != 8 or ct not in (2, 6) or il != 0:
                raise ValueError(f'{path}: only 8-bit non-interlaced RGB/RGBA supported')
        elif typ == b'IDAT':
            idat += data
        elif typ == b'IEND':
            break
    chan = 4 if ct == 6 else 3
    buf, stride = zlib.decompress(bytes(idat)), w * chan
    out, prev, p = bytearray(w * h * 4), bytearray(stride), 0
    for y in range(h):
        ft = buf[p]
        p += 1
        line = bytearray(buf[p:p + stride])
        p += stride
        if ft == 1:
            for i in range(chan, stride):
                line[i] = (line[i] + line[i - chan]) & 0xFF
        elif ft == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif ft == 3:
            for i in range(stride):
                a = line[i - chan] if i >= chan else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 0xFF
        elif ft == 4:
            for i in range(stride):
                a = line[i - chan] if i >= chan else 0
                b, c = prev[i], (prev[i - chan] if i >= chan else 0)
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 0xFF
        elif ft != 0:
            raise ValueError(f'{path}: bad filter {ft} on row {y}')
        prev = line
        o = y * w * 4
        if chan == 4:
            out[o:o + stride] = line
        else:
            for x in range(w):
                s, d = x * 3, o + x * 4
                out[d:d + 3] = line[s:s + 3]
                out[d + 3] = 255
    return w, h, out


def measure(path):
    """-> (w, h, focusX, focusY) — the ALPHA x LUMINANCE centroid."""
    w, h, px = read_rgba(path)
    sw = sx = sy = 0.0
    for y in range(h):
        row = y * w * 4
        for x in range(w):
            i = row + x * 4
            a = px[i + 3]
            if not a:
                continue
            weight = (a / 255.0) * (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 255000.0
            if weight <= 0:
                continue
            sw += weight
            sx += weight * x
            sy += weight * y
    if sw <= 0:
        raise ValueError(f'{path}: no visible ink')
    # +0.5 puts the centroid at pixel CENTRES, so a perfectly symmetric image
    # measures 0.5 rather than 0.5 - 1/(2w).
    return w, h, (sx / sw + 0.5) / w, (sy / sw + 0.5) / h


def main():
    files = sorted(f for f in os.listdir(CRESTS) if f.endswith('.png'))
    if not files:
        print('no crests found', file=sys.stderr)
        return 1
    print('const CREST_ART: Readonly<Record<string, CrestArt>> = {')
    for f in files:
        w, h, fx, fy = measure(os.path.join(CRESTS, f))
        print(f'  {f[:-4]}: {{ srcW: {w}, srcH: {h}, '
              f'focusX: {fx:.3f}, focusY: {fy:.3f} }},')
    print('};')
    return 0


if __name__ == '__main__':
    sys.exit(main())
