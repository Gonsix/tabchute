"""Generate the bundled TabChute icon without external dependencies."""
import struct
import zlib
from pathlib import Path


def rounded(x, y, left, top, right, bottom, radius):
    if not (left <= x <= right and top <= y <= bottom):
        return False
    cx = min(max(x, left + radius), right - radius)
    cy = min(max(y, top + radius), bottom - radius)
    return (x-cx)**2 + (y-cy)**2 <= radius**2


def pixel(x, y):
    if not rounded(x, y, 2, 2, 126, 126, 28):
        return (0, 0, 0, 0)
    color = (101, 87, 216, 255)
    if rounded(x, y, 29, 25, 94, 68, 9):
        color = (170, 158, 244, 255)
    if rounded(x, y, 24, 43, 100, 89, 9):
        color = (213, 207, 255, 255)
    if rounded(x, y, 28, 63, 104, 105, 9):
        color = (255, 255, 255, 255)
    if rounded(x, y, 40, 77, 89, 82, 2):
        color = (101, 87, 216, 255)
    if rounded(x, y, 40, 88, 73, 93, 2):
        color = (170, 158, 244, 255)
    return color


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))


Path('static/icons').mkdir(exist_ok=True)
for size in (16, 32, 48, 128):
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            samples = [pixel((x+(sx+.5)/4)*128/size, (y+(sy+.5)/4)*128/size) for sy in range(4) for sx in range(4)]
            alpha = sum(p[3] for p in samples)
            rows.extend([round(sum(p[c]*p[3] for p in samples)/alpha) if alpha else 0 for c in range(3)] + [round(alpha/16)])
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(bytes(rows))) + chunk(b'IEND', b'')
    Path(f'static/icons/{size}.png').write_bytes(png)
