#!/usr/bin/env python3
# Make ONE sim-ready file of an enemy tank from the part files vehicle_pack.py wrote: hull, tracks, turret, gun (cut out of the turret
# here so it can elevate and recoil), every wheel on its own axle, and a light copy of the whole vehicle for the middle distance.
#   vehicle_join.py <pack dir> <name> <out.json> <gltf-transform binary> [ratio=0.4] [far=0.07] [err=0.002] [small=0.35]
# <pack dir> holds <name>_hull.json, <name>_turret.json, <name>_wheels.json and <name>_meta.json (vehicle_pack.py ... wheels=hull).
# ratio: share of the corners kept close up; far: share kept in the light copy; err: how far a surface may move, as a share of the piece's size.
# The pieces in the result are named: hull, kord (roof machine gun, on the turret), turret, gun, trackL, trackR, wheel_00 ..., and the
# light copy lod1_hull, lod1_track, lod1_turret, lod1_gun, lod1_gear. Where the turret and gun turn, the muzzle and the wheels are written
# into the file itself (scene "extras"), all in the vehicle's frame: nose +z, standing on y = 0, +x the vehicle's left.
# Pictures are not in the file: the page puts them on by material name (see SPEC in src/render/vehmodels.js).
import sys, os, json, subprocess, tempfile, numpy as np, trimesh
src, name, out, GT = sys.argv[1:5]; opt = dict(a.split('=') for a in sys.argv[5:]); ratio = float(opt.get('ratio', 0.4)); far = float(opt.get('far', 0.07)); err = float(opt.get('err', 0.002))
meta = json.load(open(os.path.join(src, name + '_meta.json'))); piv = np.array(meta['pivot'])
def load(part): return trimesh.load(open(os.path.join(src, f'{name}_{part}.json'), 'rb'), file_type='gltf', process=False)
def geoms(scene): return [(n, g) for n, g in scene.geometry.items()]
def join(ms): return trimesh.util.concatenate(ms) if len(ms) > 1 else ms[0]
def matname(g): return getattr(g.visual.material, 'name', '') or ''

# some faces of a mesh as a mesh of their own, keeping the supplied surface directions (normals) and picture coordinates
def sub(m, idx):
    f = m.faces[idx]; used, inv = np.unique(f.reshape(-1), return_inverse=True)
    vis = trimesh.visual.TextureVisuals(uv=m.visual.uv[used], material=m.visual.material) if getattr(m.visual, 'uv', None) is not None else None
    return trimesh.Trimesh(vertices=m.vertices[used], faces=inv.reshape(-1, 3), vertex_normals=m.vertex_normals[used], visual=vis, process=False)
# connected pieces of a mesh: corners at the same place count as one
def pieces(m):
    _, inv = np.unique(np.round(m.vertices, 4), axis=0, return_inverse=True); f = inv.reshape(-1)[m.faces]; par = np.arange(inv.max() + 1)
    def find(x):
        while par[x] != x: par[x] = par[par[x]]; x = par[x]
        return x
    for a, b, c in f:
        ra = find(a); par[find(b)] = ra; par[find(c)] = ra
    root = np.array([find(a) for a in f[:, 0]]); return [np.nonzero(root == r)[0] for r in np.unique(root)]

hull, turret, wheels = load('hull'), load('turret'), load('wheels')
H = {'hull': [], 'trackL': [], 'trackR': []}
for n, g in geoms(hull): H['trackL' if n.startswith('trackL') else 'trackR' if n.startswith('trackR') else 'hull'].append(g)
T = {'turret': [], 'kord': []}
for n, g in geoms(turret): g.apply_translation(piv); T['kord' if 'kord' in n.lower() else 'turret'].append(g)   # back into the vehicle's frame
# vehicle_pack straightens by the hull's outline, which can be a degree out; the two rows of roadwheels say exactly where straight ahead is
wm = meta.get('wheels', []); slopes = [np.polyfit([w['c'][2] for w in wm if w['side'] == s and w['kind'] == 'road'], [w['c'][0] for w in wm if w['side'] == s and w['kind'] == 'road'], 1)[0] for s in 'LR' if sum(1 for w in wm if w['side'] == s and w['kind'] == 'road') > 2]
if slopes:
    a = float(np.arctan(np.mean(slopes))); ca, sa = np.cos(a), np.sin(a); Mr = np.array([[ca, 0, -sa, 0], [0, 1, 0, 0], [sa, 0, ca, 0], [0, 0, 0, 1.0]])
    for sc in (hull, turret, wheels):
        for n, g in geoms(sc): g.apply_transform(Mr)
    piv = Mr[:3, :3] @ piv
    for w in wm: w['c'] = [round(float(v), 4) for v in Mr[:3, :3] @ np.array(w['c'])]
    meta['trued_deg'] = round(float(np.degrees(a)), 2)
tur = join(T['turret'])
# the turning point: the middle of the turret's lowest rim (its ring). vehicle_pack's estimate is thrown off by a long turret bustle.
low = tur.vertices[tur.vertices[:, 1] < tur.vertices[:, 1].min() + 0.03]
if len(low) > 20 and np.ptp(low[:, 0]) > 1.5: piv = np.array([(low[:, 0].min() + low[:, 0].max()) / 2, piv[1], (low[:, 2].min() + low[:, 2].max()) / 2])

# ---- the gun: the long thin piece pointing forward out of the turret, and whatever sits round it (fume extractor, sleeves, muzzle sight) ----
ps = pieces(tur); box = [(tur.vertices[tur.faces[p].reshape(-1)].min(0), tur.vertices[tur.faces[p].reshape(-1)].max(0)) for p in ps]
cand = [(hi[2] - lo[2], i) for i, (lo, hi) in enumerate(box) if hi[2] - lo[2] > 2.5 and hi[0] - lo[0] < 0.5 and hi[1] - lo[1] < 0.5 and hi[2] > piv[2] + 2]
gun_meta = None; gun = None
if cand:
    _, bi = max(cand); lo, hi = box[bi]; ax, ay, z0 = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]
    take = [i for i, (l, h) in enumerate(box) if i == bi or (abs(l[0] - ax) < 0.3 and abs(h[0] - ax) < 0.3 and abs(l[1] - ay) < 0.3 and abs(h[1] - ay) < 0.3 and l[2] > z0 - 0.05)]
    gf = np.concatenate([ps[i] for i in take]); keep = np.ones(len(tur.faces), bool); keep[gf] = False
    gun = sub(tur, gf); tur = sub(tur, np.nonzero(keep)[0])
    gun_meta = {'pivot': [round(float(ax), 3), round(float(ay), 3), round(float(max(z0 - 0.7, piv[2] + 0.3)), 3)], 'root': round(float(z0), 3), 'muzzle': [round(float(ax), 3), round(float(ay), 3), round(float(max(box[i][1][2] for i in take)), 3)], 'pieces': len(take)}
else: print('NO GUN FOUND: the barrel is joined to the turret; the turret will turn but the gun will not elevate')

# the light copy leaves out everything small (bolts, handles, single armour blocks): pieces whose longest side is under `small` metres
def prune(m, small):
    ps = pieces(m); keep = [p for p in ps if (np.ptp(m.vertices[m.faces[p].reshape(-1)], axis=0)).max() >= small]
    return sub(m, np.concatenate(keep)) if keep and len(keep) < len(ps) else m
def write(parts, path, r, e, lock='true'):
    sc = trimesh.Scene()
    for n, g in parts: sc.add_geometry(g, node_name=n, geom_name=n)
    raw = path + '.raw.glb'; sc.export(raw); w = path + '.weld.glb'
    subprocess.run([GT, 'weld', raw, w], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([GT, 'simplify', w, path, '--ratio', str(r), '--error', str(e), '--lock-border', lock], check=True, stdout=subprocess.DEVNULL); os.remove(raw); os.remove(w)

tmp = tempfile.mkdtemp(); near = [('hull', join(H['hull'])), ('turret', tur)]
if gun is not None: near.append(('gun', gun))
if T['kord']: near.append(('kord', join(T['kord'])))
for k in ('trackL', 'trackR'):
    if H[k]: near.append((k, join(H[k])))
wl = sorted(geoms(wheels)); near += [(n[:8], g) for n, g in wl]                                                   # wheel_00 ... as vehicle_pack named them
small = float(opt.get('small', 0.35)); light = [('lod1_hull', prune(join(H['hull']).copy(), small)), ('lod1_turret', prune(tur.copy(), small))]
if gun is not None: light.append(('lod1_gun', gun.copy()))
if H['trackL'] and H['trackR']: light.append(('lod1_track', join([H['trackL'][0].copy(), H['trackR'][0].copy()])))
if wl: light.append(('lod1_gear', prune(join([g.copy() for n, g in wl]), small)))
a, b, c = os.path.join(tmp, 'a.glb'), os.path.join(tmp, 'b.glb'), os.path.join(tmp, 'c.glb')
write(near, a, ratio, err); write(light, b, far, err * 15, 'false')
subprocess.run([GT, 'merge', a, b, c, '--merge-scenes', '--vertex-layout', 'separate'], check=True, stdout=subprocess.DEVNULL)
subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'glb2json.py'), c, out], check=True, stdout=subprocess.DEVNULL)
j = json.load(open(out)); acc = j['accessors']; tri = {}
for nd in j['nodes']:
    if 'mesh' in nd: tri[nd.get('name', '?')] = sum((acc[p['indices']]['count'] if 'indices' in p else acc[p['attributes']['POSITION']]['count']) // 3 for p in j['meshes'][nd['mesh']]['primitives'])
extras = {'name': name, 'turret': [round(float(v), 3) for v in piv], 'gun': gun_meta, 'wheels': meta.get('wheels', []), 'size': meta.get('size'), 'trued_deg': meta.get('trued_deg', 0)}
for s in j['scenes']: s['extras'] = extras
for m in j.get('materials', []):                                                                                    # the page attaches the pictures; drop anything the exporter put in
    for k in ('pbrMetallicRoughness', 'normalTexture', 'occlusionTexture', 'emissiveTexture'): m.pop(k, None)
for k in ('textures', 'images', 'samplers'): j.pop(k, None)
open(out, 'w').write(json.dumps(j, separators=(',', ':')))
n1 = sum(v for k, v in tri.items() if not k.startswith('lod1_')); n2 = sum(v for k, v in tri.items() if k.startswith('lod1_'))
print(json.dumps({'trued_deg': meta.get('trued_deg', 0), 'turret': extras['turret'], 'out': out, 'bytes': os.path.getsize(out), 'triangles_close': n1, 'triangles_light': n2, 'gun': gun_meta, 'pieces': tri}))
