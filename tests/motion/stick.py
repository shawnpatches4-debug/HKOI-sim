# python3 tests/motion/stick.py <dump.json> <out.png> [view=side|quarter|front|top] [follow=1] [cols=8] [cell=260] [span=4.5] [last=N] [first=N] [fig=0|1 (keep this man in the middle)]
# Draws the frames written by `node tests/motion/harness.mjs dump ...` as stick figures, one cell per frame, to judge a movement by eye
# in seconds (the browser takes minutes). Left limbs are blue, right limbs red, loads orange, feet that are down get a black dot.
import json, sys, math
from PIL import Image, ImageDraw
d = json.load(open(sys.argv[1])); out = sys.argv[2]; opt = dict(a.split('=') for a in sys.argv[3:])
view = opt.get('view', 'side'); follow = opt.get('follow', '1') == '1'; cols = int(opt.get('cols', 8)); cell = int(opt.get('cell', 260)); span = float(opt.get('span', 4.5))
NAMES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase']
par = d['parents']; F = d['frames']; F = F[-int(opt['last']):] if 'last' in opt else F; F = F[:int(opt['first'])] if 'first' in opt else F; fig = int(opt['fig']) if 'fig' in opt else None; rows = (len(F) + cols - 1) // cols; W = cell; Hh = int(cell * float(opt.get('tall', 0.72)))
img = Image.new('RGB', (cols * W, rows * Hh), 'white'); dr = ImageDraw.Draw(img)
yaw = {'side': 0, 'quarter': math.radians(40), 'front': math.radians(90), 'top': 0}[view]
def proj(p, c):
    x, y, z = p[0] - c[0], p[1] - c[1], p[2] - c[2]
    if view == 'top': return x, -z
    xr = x * math.cos(yaw) + z * math.sin(yaw); zr = -x * math.sin(yaw) + z * math.cos(yaw)
    return xr, y + (0.25 * zr if view == 'quarter' else 0)
c0 = F[0]['map']
for i, f in enumerate(F):
    ox, oy = (i % cols) * W, (i // cols) * Hh; c = ([f['figs'][fig][0][0], f['map'][1], f['figs'][fig][0][2]] if fig is not None else f['map']) if follow else c0; s = W / span
    P = lambda p: (ox + W / 2 + proj(p, c)[0] * s, oy + Hh * (0.5 if view == 'top' else 0.8) - proj(p, c)[1] * s)
    dr.rectangle([ox, oy, ox + W - 1, oy + Hh - 1], outline='#cccccc')
    if view != 'top':
        g = [P(p) for p in d['ground'] if abs(p[0] - c[0]) < span / 2]
        if len(g) > 1: dr.line(g, fill='#7a9a50', width=1)
    inside = lambda p: abs(proj(p, c)[0]) < span / 2
    for l in f['loads']:
        if not inside(l['c']): continue
        dr.line([P(l['a']), P(l['b'])], fill='#e08a00', width=5 if l['name'] != 'round' else 3); x, y = P(l['a']); dr.ellipse([x - 3, y - 3, x + 3, y + 3], fill='#804000')
    for fi, J in enumerate(f['figs']):
        if not inside(J[0]): continue
        for k in range(1, 22):
            n = NAMES[k]; col = '#2050d0' if n.startswith('Left') else '#d02020' if n.startswith('Right') else '#202020'
            dr.line([P(J[par[k]]), P(J[k])], fill=col, width=3)
        hx, hy = P(J[5]); nx, ny = P(J[4]); r = 0.11 * s; cx, cy = hx + (hx - nx) * 0.9, hy + (hy - ny) * 0.9; dr.ellipse([cx - r, cy - r, cx + r, cy + r], outline='#202020', width=2)
        for k, b in enumerate([17, 21]):
            if f['feet'][fi][k]: x, y = P(J[b]); dr.ellipse([x - 3, y - 3, x + 3, y + 3], fill='black')
    mx, my = P(f['map']); dr.line([mx, my, mx, my + 8], fill='#00a000', width=2)
    dr.text((ox + 4, oy + 3), '%.2fs %s' % (f['t'], f.get('act', '')), fill='#444444')
img.save(out); print('saved', out, img.size)
