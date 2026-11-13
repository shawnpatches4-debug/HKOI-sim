# python3 tools/mapimg.py world.json out.png : shaded-relief preview of a generated battlefield with the tactical overlays
import json, sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont
d = json.load(open(sys.argv[1])); n = d['n']; S = d['size']; H = np.array(d['H'], dtype=np.float32).reshape(n, n); V = np.array(d['V'], dtype=np.uint8).reshape(n, n); F = np.array(d['F']).reshape(n, n)
cell = S / (n - 1); gy, gx = np.gradient(H, cell); nx, ny, nz = -gx, -gy, np.ones_like(H); L = np.sqrt(nx * nx + ny * ny + 1); sun = np.array([-0.55, 0.55, 0.62]); shade = np.clip((nx * sun[0] + ny * sun[1] + nz * sun[2]) / L, 0, 1)
biome = d['stats']['biome']; base = {'farmland': (150, 158, 96), 'desert': (201, 174, 126), 'town': (150, 156, 104), 'forest': (128, 146, 92)}[biome]
img = np.zeros((n, n, 3), dtype=np.float32); img[:] = base
fh = (F * 2654435761 % 255) / 255.0
img[V == 1] = np.stack([150 + 50 * fh, 160 + 30 * fh, 80 + 20 * fh], -1)[V == 1]; img[V == 2] = np.stack([110 + 30 * fh, 140 + 20 * fh, 60 + 0 * fh], -1)[V == 2]
img[(V == 0) & (F > 0)] = np.stack([150 + 40 * fh, 125 + 30 * fh, 90 + 20 * fh], -1)[(V == 0) & (F > 0)]
img[V == 3] = (120, 130, 80); img[V == 4] = (44, 82, 48); img[V == 5] = (36, 70, 40); img[V == 6] = (150, 140, 130); img[V == 7] = (196, 186, 160)
t = (H - H.min()) / max(1e-3, H.max() - H.min()); img *= (0.55 + 0.6 * shade)[..., None] * (0.9 + 0.2 * t)[..., None]
im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)[::-1]).resize((1024, 1024), Image.BILINEAR); dr = ImageDraw.Draw(im, 'RGBA'); P = lambda e, nn: ((e + S / 2) / S * 1024, (1 - (nn + S / 2) / S) * 1024)
for lev in np.arange(math.floor(H.min() / 10) * 10, H.max(), 10 if H.max() - H.min() < 80 else 20):
    m = (H[:-1, :-1] < lev) != (H[1:, 1:] < lev); ys, xs = np.nonzero(m)
    for y, x in zip(ys[::1], xs[::1]): px, py = x / (n - 1) * 1024, (1 - y / (n - 1)) * 1024; dr.point((px, py), fill=(60, 40, 20, 70))
for e, nn, dd in d['vs']: x, y = P(e, nn); dr.rectangle((x - 5, y - 5, x + 5, y + 5), fill=(255, 60, 40, 46))
for r in d['roads']: dr.line([P(*p) for p in r], fill=(230, 220, 190, 255), width=2)
for e, nn, w, dd, rot, h in d['buildings']:
    c, s = math.cos(rot), math.sin(rot); k = 1.6; pts = [P(e + (a * w / 2 * c - b * dd / 2 * s) * k, nn + (a * w / 2 * s + b * dd / 2 * c) * k) for a, b in [(-1, -1), (1, -1), (1, 1), (-1, 1)]]; dr.polygon(pts, fill=(70, 62, 60, 255))
for c in d['cover']: x, y = P(c['e'], c['n']); dr.ellipse((x - 3, y - 3, x + 3, y + 3), outline=(80, 200, 255, 255))
for i, s in enumerate(d['sites']): x, y = P(s['e'], s['n']); dr.polygon([(x, y - 9), (x + 9, y), (x, y + 9), (x - 9, y)], outline=(255, 30, 20, 255), fill=(255, 30, 20, 90)); dr.text((x + 11, y - 6), str(i + 1), fill=(255, 255, 255, 255))
x, y = P(0, 0); dr.rectangle((x - 6, y - 9, x + 6, y + 9), outline=(255, 255, 255, 255), width=2)
for k in range(1, 4): r = k * 1000 / S * 1024; dr.ellipse((x - r, y - r, x + r, y + r), outline=(255, 255, 255, 60))
dr.rectangle((0, 0, 1024, 26), fill=(0, 0, 0, 150)); dr.text((8, 7), f"{biome.upper()}  seed {d['stats']['seed']}   8 x 8 km   relief {d['stats']['minH']} to {d['stats']['maxH']} m   red shade: ground with a sight line to the tank   diamonds: ambush sites   blue: cover", fill=(255, 255, 255, 255))
im.save(sys.argv[2]); print('saved', sys.argv[2])
