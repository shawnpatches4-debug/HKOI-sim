#!/usr/bin/env python3
# Turn the part files from lineup_split.py into sim-ready pieces: straighten the vehicle (nose along +z, centred, standing on y=0),
# find the turret's turning point, and write one single-file glTF (.json) per part plus meta.json.
#   vehicle_pack.py <parts dir> <out dir> <name> hull=hull turret=turret[,m2] [length_m]
# Optional  wheels=<hull part file>  looks through that file for the wheels (roadwheels, drive sprockets, idlers, rollers), takes them out
# of the hull and writes them as their own file <name>_wheels.json, one piece per wheel named wheel_00, wheel_01, ..., so the sim can
# turn each wheel about its own axle. Each wheel's axle centre and radius go into meta.json under "wheels".
#   example: vehicle_pack.py parts out m1v3 hull=hull,skirts,trackL,trackR turret=turret,m2 wheels=hull
import sys, os, json, numpy as np, trimesh, subprocess
src, out, name = sys.argv[1:4]; groups = dict(a.split('=') for a in sys.argv[4:] if '=' in a); wheel_src = groups.pop('wheels', None); want_len = float(next((a for a in sys.argv[4:] if '=' not in a), 0) or 0)
os.makedirs(out, exist_ok=True)
def verts(p): return np.array([[float(x) for x in l.split()[1:4]] for l in open(os.path.join(src, p + '.obj')) if l.startswith('v ')])
H = np.vstack([verts(p) for p in groups['hull'].split(',')]); T = np.vstack([verts(p) for p in groups['turret'].split(',')]) if 'turret' in groups else None
c = H[:, [0, 2]].mean(0); u, s, vt = np.linalg.svd(H[:, [0, 2]] - c, full_matrices=False); ax = vt[0]            # the hull's long direction on the ground
if T is not None:                                                                                                # the gun barrel says which end is the front
    d = (T[:, [0, 2]] - c) @ ax; ax = ax if abs(d.max()) > abs(d.min()) else -ax
ang = np.arctan2(ax[0], ax[1]); ca, sa = np.cos(-ang), np.sin(-ang)
R = np.array([[ca, 0, sa], [0, 1, 0], [-sa, 0, ca]])                                                              # turn about the vertical so `ax` becomes +z
Hr = H @ R.T; mid = np.array([(Hr[:, 0].min() + Hr[:, 0].max()) / 2, Hr[:, 1].min(), (Hr[:, 2].min() + Hr[:, 2].max()) / 2]); k = want_len / (Hr[:, 2].max() - Hr[:, 2].min()) if want_len else 1
M = np.eye(4); M[:3, :3] = R * k; M[:3, 3] = -(mid @ np.eye(3)) * k
meta = {'name': name, 'scale': round(float(k), 4), 'parts': {}}
if T is not None:
    Tr = (T @ R.T - mid) * k; low = Tr[Tr[:, 1] < np.percentile(Tr[:, 1], 12)]; side = Tr[np.abs(Tr[:, 0]) > 0.5]
    meta['pivot'] = [0.0, round(float(np.percentile(Tr[:, 1], 3)), 3), round(float((np.median(low[:, 2]) + (side[:, 2].min() + side[:, 2].max()) / 2) / 2), 3)]   # between the turret's underside and the middle of its body

# ---- Wheels -------------------------------------------------------------------------------------------------------------------------
# The supplier's hull is one object with the wheels inside it, but each wheel is made of pieces that touch nothing else (two discs, a hub,
# a cap, bolts). So: break the hull into connected pieces, pick out the pieces that are wheel discs, group discs on the same axle into a
# wheel, and then add every small piece that sits wholly inside that wheel's cylinder (hubs, caps, bolts).
# A piece is a wheel disc when, on the straightened vehicle, it is
#   round in the side view (as tall as it is long, and no point further from its middle than its radius: a square plate fails this),
#   of a plausible size (0.4 to 0.95 m across) and flat (thinner across the vehicle than 0.6 of its diameter),
#   low on the vehicle (axle no higher than 1.1 m) and standing in one of the two track lanes: its middle must lie within the width of a track
#   (the tracks are the faces whose material name contains 'track'; with no such faces, "within 0.3 m of where most discs are" is used).
def track_lanes():
    xs = []
    for f in groups['hull'].split(','):
        v = []; used = set(); on = False
        for l in open(os.path.join(src, f + '.obj')):
            if l.startswith('v '): v.append([float(x) for x in l.split()[1:4]])
            elif l.startswith('usemtl '): on = 'track' in l.lower()
            elif l.startswith('f ') and on: used.update(int(t.split('/')[0]) - 1 for t in l.split()[1:])
        if used: xs.append(((np.array(v)[sorted(used)] @ R.T - mid) * k)[:, 0])
    if not xs: return None
    xs = np.abs(np.concatenate(xs)); return float(xs.min()), float(xs.max())                      # inner and outer edge of a track, measured from the centre line
def find_wheels(part):
    lines = open(os.path.join(src, part + '.obj')).read().split('\n'); raw = np.array([[float(x) for x in l.split()[1:4]] for l in lines if l.startswith('v ')])
    P = (raw @ R.T - mid) * k; width = Hf[:, 0].max() - Hf[:, 0].min()
    weld = {}; w = [weld.setdefault(tuple(p), i) for i, p in enumerate(np.round(P, 4))]          # corners at the same place count as one
    par = list(range(len(P)))
    def find(x):
        while par[x] != x: par[x] = par[par[x]]; x = par[x]
        return x
    faces = []; mtl = None                                                                       # (line number, material, corner numbers)
    for n, l in enumerate(lines):
        if l.startswith('usemtl '): mtl = l[7:].strip()
        elif l.startswith('f '):
            ids = [int(t.split('/')[0]) - 1 for t in l.split()[1:]]; faces.append((n, mtl, ids)); a = find(w[ids[0]])
            for b in ids[1:]: par[find(w[b])] = a
    pieces = {}
    for n, m, ids in faces: pc = pieces.setdefault(find(w[ids[0]]), {'lines': [], 'ids': set()}); pc['lines'].append(n); pc['ids'].update(ids)
    discs = []
    for pc in pieces.values():
        Q = P[list(pc['ids'])]; lo, hi = Q.min(0), Q.max(0); sz = hi - lo; c = (lo + hi) / 2; pc['Q'] = Q; dia = (sz[1] + sz[2]) / 2
        if not (0.4 <= dia <= 0.95 and abs(sz[1] - sz[2]) < 0.06 * dia and sz[0] < 0.6 * dia and c[1] <= 1.1 and abs(c[0]) > 0.2 * width): continue
        if np.hypot(Q[:, 1] - c[1], Q[:, 2] - c[2]).max() > dia / 2 * 1.05: continue                  # corners stick out: not round
        discs.append((c, dia / 2, lo[0], hi[0], pc))
    lane = track_lanes() or (lambda m: (m - 0.3, m + 0.3))(float(np.median([abs(d[0][0]) for d in discs]))) if discs else (0, 0)
    discs = [d for d in discs if lane[0] <= abs(d[0][0]) <= lane[1]]
    wheels = []                                                                                 # discs on one axle (same side, centres within 5 cm) make one wheel
    for c, r, x0, x1, pc in sorted(discs, key=lambda d: -d[1]):
        for wh in wheels:
            if wh['c'][0] * c[0] > 0 and np.hypot(wh['c'][1] - c[1], wh['c'][2] - c[2]) < 0.05: wh['x0'] = min(wh['x0'], x0); wh['x1'] = max(wh['x1'], x1); break
        else: wheels.append({'c': c.copy(), 'r': r, 'x0': x0, 'x1': x1, 'lines': []})
    for pc in pieces.values():                                                                  # everything wholly inside a wheel's cylinder turns with it
        Q = pc['Q']
        for wh in wheels:
            if Q[:, 0].min() > wh['x0'] - 0.1 and Q[:, 0].max() < wh['x1'] + 0.1 and np.hypot(Q[:, 1] - wh['c'][1], Q[:, 2] - wh['c'][2]).max() < wh['r'] * 1.03: wh['lines'] += pc['lines']; break
    # name them: on each side the wheels standing on the track are roadwheels; a raised one at the very back is the drive sprocket (Abrams,
    # T-72 and most tanks drive from the rear), a raised one at the very front the idler, anything else raised is a return roller
    wheels.sort(key=lambda wh: (wh['c'][0] < 0, -wh['c'][2])); out_w = []; taken = set()
    for i, wh in enumerate(wheels):
        side = [o for o in wheels if o['c'][0] * wh['c'][0] > 0]; lowest = min(o['c'][1] - o['r'] for o in side); zs = [o['c'][2] for o in side]
        kind = 'road' if wh['c'][1] - wh['r'] < lowest + 0.12 else 'sprocket' if wh['c'][2] == min(zs) else 'idler' if wh['c'][2] == max(zs) else 'roller'
        wh['c'][0] = (wh['x0'] + wh['x1']) / 2; taken.update(wh['lines'])
        out_w.append({'name': 'wheel_%02d' % i, 'side': 'L' if wh['c'][0] > 0 else 'R', 'kind': kind, 'c': [round(float(v), 4) for v in wh['c']], 'r': round(float(wh['r']), 4), 'faces': len(wh['lines'])})   # +x is the vehicle's left when the nose is along +z
        keep = set(wh['lines']); open(os.path.join(src, '_wheel_%02d.obj' % i), 'w').write('\n'.join(l for n, l in enumerate(lines) if not l.startswith('f ') or n in keep) + '\n')
    open(os.path.join(src, '_' + part + '_nowheels.obj'), 'w').write('\n'.join(l for n, l in enumerate(lines) if n not in taken) + '\n')
    return out_w
Hf = (H @ R.T - mid) * k; made = []
if wheel_src:
    meta['wheels'] = find_wheels(wheel_src); made = ['_' + wheel_src + '_nowheels'] + ['_' + w['name'] for w in meta['wheels']]
    groups['hull'] = ','.join('_' + wheel_src + '_nowheels' if f == wheel_src else f for f in groups['hull'].split(',')); groups['wheels'] = ','.join('_' + w['name'] for w in meta['wheels'])
for part, files in groups.items():
    sc = trimesh.Scene()
    for f in files.split(','):
        m = trimesh.load(os.path.join(src, f + '.obj'), process=False, split_object=True, group_material=True)
        for gname, g in (m.geometry.items() if hasattr(m, 'geometry') else [(getattr(m.visual.material, 'name', f), m)]): g.apply_transform(M); sc.add_geometry(g, geom_name=f.lstrip('_') + '_' + gname)   # each piece is named <file>_<material>
    piv = np.array(meta.get('pivot', [0, 0, 0])) if part == 'turret' else np.zeros(3)
    for g in sc.geometry.values(): g.apply_translation(-piv)                                                       # the turret file is centred on its turning point
    glb = os.path.join(out, f'{name}_{part}.glb'); sc.export(glb)
    meta['parts'][part] = {'faces': int(sum(len(g.faces) for g in sc.geometry.values())), 'materials': sorted({getattr(g.visual.material, 'name', '?') for g in sc.geometry.values()})}
    subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'glb2json.py'), glb, glb[:-4] + '.json'], check=True, stdout=subprocess.DEVNULL); os.remove(glb)
for f in made: os.remove(os.path.join(src, f + '.obj'))                                                           # the working files for the wheels
meta['size'] = [round(float(Hf[:, i].max() - Hf[:, i].min()), 2) for i in range(3)]
json.dump(meta, open(os.path.join(out, name + '_meta.json'), 'w')); print(json.dumps(meta))
