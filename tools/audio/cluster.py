#!/usr/bin/env python3
# Optional step of the sound-pack pipeline: group the distinct clips by the colour of the voice, to guess how many different
# voices (or recording set-ups: this cannot tell them apart) a pack holds. Written for the crew pack: it looks at clips 0..520.
#   python3 -I tools/audio/cluster.py <work dir>     reads features.json and decode_meta.json, writes clusters.json ("group" in the catalogue)
import sys, json, numpy as np
S = sys.argv[1]
F = json.load(open(S + '/features.json')); meta = json.load(open(S + '/decode_meta.json'))
ids = [i for i in range(521) if 'dup' not in F[str(i)] and F[str(i)]['dur'] > 0.7]
X = np.array([F[str(i)]['cep'][1:] for i in ids]); X = (X - X.mean(0)) / X.std(0)
rng = np.random.default_rng(1)
def km(X, k, it=60):
    best = None
    for r in range(8):
        C = X[rng.choice(len(X), k, replace=False)]
        for _ in range(it):
            d = ((X[:, None] - C[None]) ** 2).sum(2); a = d.argmin(1); C = np.array([X[a == j].mean(0) if (a == j).any() else C[j] for j in range(k)])
        s = d.min(1).sum()
        if best is None or s < best[0]: best = (s, a)
    return best
for k in (2, 3, 4, 5, 6):
    s, a = km(X, k); print(k, round(s / len(X), 2), np.bincount(a))
s, a = km(X, 4)
lab = ''.join(str(a[ids.index(i)]) if i in ids else '.' for i in range(521))
for o in range(0, 521, 100): print(o, lab[o:o + 100])
hz = {m['i']: m['hz'] for m in meta}
rate = ''.join({44100: '4', 32000: '3', 24000: '2', 22050: '1'}[hz[i]] for i in range(521))
for o in range(0, 521, 100): print(o, rate[o:o + 100])
for c in range(4):
    sel = [ids[j] for j in range(len(ids)) if a[j] == c]
    print(c, len(sel), 'f0 med', np.median([F[str(i)]['f0'] for i in sel]), 'cen', np.median([F[str(i)]['cen'] for i in sel]), 'hfr', np.median([F[str(i)]['hfr'] for i in sel]))
json.dump({str(i): int(a[ids.index(i)]) for i in ids}, open(S + '/clusters.json', 'w'))
