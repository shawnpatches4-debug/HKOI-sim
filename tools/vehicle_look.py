#!/usr/bin/env python3
# A quick look at a packed vehicle file without a browser: side, top and front views with every piece in its own colour, the
# close copy above the light copy. Shows at a glance whether the gun was cut from the turret, the wheels found and the nose is at +z.
#   vehicle_look.py <vehicle.json> <out.png>
import sys, json, base64, numpy as np
from PIL import Image, ImageDraw
j = json.load(open(sys.argv[1])); buf = base64.b64decode(j['buffers'][0]['uri'].split('base64,')[1])
def acc(i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]; n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[a['type']]; dt = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}[a['componentType']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); st = bv.get('byteStride', 0); size = np.dtype(dt).itemsize * n
    if st and st != size: return np.array([np.frombuffer(buf, dt, n, off + k * st) for k in range(a['count'])])
    return np.frombuffer(buf, dt, a['count'] * n, off).reshape(-1, n)
parts = []
for nd in j['nodes']:
    if 'mesh' not in nd: continue
    for p in j['meshes'][nd['mesh']]['primitives']:
        v = acc(p['attributes']['POSITION']).astype(float) + np.array(nd.get('translation', [0, 0, 0])); f = acc(p['indices']).reshape(-1, 3) if 'indices' in p else np.arange(len(v)).reshape(-1, 3)
        parts.append((nd.get('name', '?'), v, f))
COL = {'hull': (120, 140, 90), 'turret': (200, 170, 60), 'gun': (230, 60, 60), 'kord': (60, 200, 230), 'track': (90, 90, 90), 'wheel': (70, 110, 220), 'gear': (70, 110, 220)}
col = lambda n: next((c for k, c in COL.items() if k in n.replace('lod1_', '')), (200, 200, 200))
S = 90; W, H = 1500, 1160; im = Image.new('RGB', (W, H), (245, 245, 240)); d = ImageDraw.Draw(im)
def view(sel, ox, oy, ax, ay, sx=1):
    for n, v, f in parts:
        if not sel(n): continue
        c = col(n); P = np.stack([ox + sx * v[:, ax] * S, oy - v[:, ay] * S], 1)
        for t in f[:: max(1, len(f) // 6000)]: d.line([tuple(P[t[0]]), tuple(P[t[1]]), tuple(P[t[2]]), tuple(P[t[0]])], fill=c)
near = lambda n: not n.startswith('lod1_'); light = lambda n: n.startswith('lod1_')
view(near, 430, 330, 2, 1); view(near, 1150, 330, 0, 1); view(near, 430, 30 + 3.2 * S, 2, 0)          # side (nose to the right), front, top
view(light, 430, 900, 2, 1); view(light, 1150, 900, 0, 1)
ex = j['scenes'][0].get('extras', {})
for name, p in (('turret', ex.get('turret')), ('gun', (ex.get('gun') or {}).get('pivot')), ('muzzle', (ex.get('gun') or {}).get('muzzle'))):
    if p: d.ellipse([430 + p[2] * S - 5, 330 - p[1] * S - 5, 430 + p[2] * S + 5, 330 - p[1] * S + 5], outline=(0, 0, 0), width=2); d.text((430 + p[2] * S + 8, 330 - p[1] * S - 16), name, fill=(0, 0, 0))
d.text((20, 10), 'close copy: side (nose right), front, top', fill=(0, 0, 0)); d.text((20, 700), 'light copy', fill=(0, 0, 0)); im.save(sys.argv[2]); print(sys.argv[2])
