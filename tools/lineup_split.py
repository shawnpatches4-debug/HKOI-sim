#!/usr/bin/env python3
# Cut one variant out of a "lineup" OBJ (several vehicles side by side in one file) and write it as separate part files.
#   lineup_split.py <lineup.obj> <object-name prefix> <outdir> part=regex [part=regex ...]
# Each object whose name starts with the prefix goes to the first part whose regex matches the rest of its name.
# Output: <outdir>/<part>.obj with a material file that names the materials but attaches no pictures (those are published separately).
import sys, re, os, json
src, prefix, out = sys.argv[1:4]; parts = [a.split('=', 1) for a in sys.argv[4:]]
os.makedirs(out, exist_ok=True)
V, VT, VN = [], [], []; faces = {p: [] for p, _ in parts}; cur = None; mtl = None; mats = set(); seen = {}
for line in open(src, errors='ignore'):
    if line.startswith('v '): V.append(line[2:].split()[:3])
    elif line.startswith('vt '): VT.append(line[3:].split()[:2])
    elif line.startswith('vn '): VN.append(line[3:].split()[:3])
    elif line.startswith(('o ', 'g ')):
        name = line[2:].strip(); cur = None
        if name.startswith(prefix):
            rest = name[len(prefix):]
            for p, rx in parts:
                if re.search(rx, rest): cur = p; seen.setdefault(p, []).append(rest); break
            else: seen.setdefault('(unused)', []).append(rest)
    elif line.startswith('usemtl '): mtl = line[7:].strip()
    elif line.startswith('f ') and cur: faces[cur].append((mtl, line[2:].split())); mats.add(mtl)
open(os.path.join(out, 'parts.mtl'), 'w').write(''.join(f'newmtl {m}\nKd 0.8 0.8 0.8\n' for m in sorted(mats)))
info = {}
for p, fl in faces.items():
    vi, ti, ni = {}, {}, {}; ov, ot, on, of = [], [], [], []; last = None
    def idx(tab, lst, src_list, k):
        k = int(k); k = k - 1 if k > 0 else len(src_list) + k
        if k not in tab: tab[k] = len(lst) + 1; lst.append(src_list[k])
        return tab[k]
    for m, toks in fl:
        if m != last: of.append('usemtl ' + m); last = m
        o = []
        for t in toks:
            a = (t.split('/') + ['', ''])[:3]; o.append('%d/%s/%s' % (idx(vi, ov, V, a[0]), idx(ti, ot, VT, a[1]) if a[1] else '', idx(ni, on, VN, a[2]) if a[2] else ''))
        of.append('f ' + ' '.join(o))
    with open(os.path.join(out, p + '.obj'), 'w') as f:
        f.write('mtllib parts.mtl\no ' + p + '\n' + ''.join('v %s\n' % ' '.join(v) for v in ov) + ''.join('vt %s\n' % ' '.join(v) for v in ot) + ''.join('vn %s\n' % ' '.join(v) for v in on) + '\n'.join(of) + '\n')
    xs = [[float(c) for c in v] for v in ov]
    info[p] = {'faces': len(fl), 'min': [round(min(v[i] for v in xs), 3) for i in range(3)], 'max': [round(max(v[i] for v in xs), 3) for i in range(3)]} if xs else {'faces': 0}
print(json.dumps({'objects': seen, 'parts': info, 'materials': sorted(mats)}, indent=1))
