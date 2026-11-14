#!/usr/bin/env python3
# Draws the outlines written by `node tests/motion/vehicles.test.mjs dump <file.json>`: each chosen moment from the side, the front
# and above (vehicle in grey, riders' skeletons in red, the ground line in brown).   vehicle_sheet.py <file.json> <out.png>
import sys, json, math
from PIL import Image, ImageDraw
D = json.load(open(sys.argv[1])); S = 34; CW, CH = 1500, 330; im = Image.new('RGB', (CW, CH * len(D)), (246, 246, 240)); d = ImageDraw.Draw(im)
for r, it in enumerate(D):
    ax, ay, az = it['at']; h = it['h']; fe, fn = math.sin(h), math.cos(h); oy = r * CH + 215
    def loc(x, y, z):                                   # into the vehicle's own frame: forward, up, to its left
        e, n = x - ax, -(z - az); return e * fe + n * fn, y - ay, -(e * fn - n * fe)
    views = [(330, lambda f, u, l: (f, u)), (880, lambda f, u, l: (l, u)), (1250, lambda f, u, l: (l, f * 0.5 + 2.5))]
    for ox, pr in views: d.line([ox - 9 * S, oy, ox + 9 * S if ox < 800 else ox + 5 * S, oy], fill=(190, 150, 110))
    L = it['lines']
    for i in range(0, len(L) - 8, 9):
        p = [loc(L[i + 3 * k], L[i + 3 * k + 1], L[i + 3 * k + 2]) for k in range(3)]
        for ox, pr in views:
            q = [(ox + pr(*a)[0] * S, oy - pr(*a)[1] * S) for a in p]; d.line(q + [q[0]], fill=(95, 105, 95))
    B = it['bones']
    for i in range(0, len(B) - 5, 6):
        a, b = loc(*B[i:i + 3]), loc(*B[i + 3:i + 6])
        for ox, pr in views: d.line([ox + pr(*a)[0] * S, oy - pr(*a)[1] * S, ox + pr(*b)[0] * S, oy - pr(*b)[1] * S], fill=(215, 30, 30), width=2)
    d.text((14, r * CH + 8), it['title'] + '      side (nose right)  |  front  |  from above', fill=(0, 0, 0))
im.save(sys.argv[2]); print(sys.argv[2], im.size)
