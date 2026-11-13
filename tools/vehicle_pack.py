#!/usr/bin/env python3
# Turn the part files from lineup_split.py into sim-ready pieces: straighten the vehicle (nose along +z, centred, standing on y=0),
# find the turret's turning point, and write one single-file glTF (.json) per part plus meta.json.
#   vehicle_pack.py <parts dir> <out dir> <name> hull=hull turret=turret[,m2] [length_m]
import sys, os, json, numpy as np, trimesh, subprocess
src, out, name = sys.argv[1:4]; groups = dict(a.split('=') for a in sys.argv[4:] if '=' in a); want_len = float(next((a for a in sys.argv[4:] if '=' not in a), 0) or 0)
os.makedirs(out, exist_ok=True)
def verts(p): return np.array([[float(x) for x in l.split()[1:4]] for l in open(os.path.join(src, p + '.obj')) if l.startswith('v ')])
H = verts(groups['hull'].split(',')[0]); T = np.vstack([verts(p) for p in groups['turret'].split(',')]) if 'turret' in groups else None
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
for part, files in groups.items():
    sc = trimesh.Scene()
    for f in files.split(','):
        m = trimesh.load(os.path.join(src, f + '.obj'), process=False, split_object=True, group_material=True)
        for gname, g in (m.geometry.items() if hasattr(m, 'geometry') else [(f, m)]): g.apply_transform(M); sc.add_geometry(g, geom_name=f + '_' + gname)
    piv = np.array(meta.get('pivot', [0, 0, 0])) if part == 'turret' else np.zeros(3)
    for g in sc.geometry.values(): g.apply_translation(-piv)                                                       # the turret file is centred on its turning point
    glb = os.path.join(out, f'{name}_{part}.glb'); sc.export(glb)
    meta['parts'][part] = {'faces': int(sum(len(g.faces) for g in sc.geometry.values())), 'materials': sorted({getattr(g.visual.material, 'name', '?') for g in sc.geometry.values()})}
    subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'glb2json.py'), glb, glb[:-4] + '.json'], check=True, stdout=subprocess.DEVNULL); os.remove(glb)
Hf = (H @ R.T - mid) * k; meta['size'] = [round(float(Hf[:, i].max() - Hf[:, i].min()), 2) for i in range(3)]
json.dump(meta, open(os.path.join(out, name + '_meta.json'), 'w')); print(json.dumps(meta))
