#!/usr/bin/env python3
# What the built crew voices measure like (nobody can listen in the workspace):
#   python3 -I tools/audio/voice_report.py <assets dir> <work dir> [prefix = crew4]
# 1. the four men: pitch and formants of each man's REAL lines (the pack's recordings, re-voiced) in the built strips:
#    are the four clearly apart?
# 2. made against real: for each man, the same measures for his synthesised and spliced lines beside his real ones
# 3. the list of made lines from <work>/voices_report.json: words, who, how made, and how far from the real lines
import sys, os, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voicelib as V

A, W = sys.argv[1], sys.argv[2]; PRE = sys.argv[3] if len(sys.argv) > 3 else 'crew4'
idx = json.load(open(os.path.join(A, PRE + '_index.json'))); strips = {k: V.load(os.path.join(A, f)) for k, f in idx['strips'].items()}
rows = {}
for who, E in idx['e'].items():
    for ev, L in E.items():
        for x in L:
            a = strips[x[0]][int(x[1] * V.SR):int((x[1] + x[2]) * V.SR)]
            if len(a) < V.SR * 0.6: continue
            m = V.measure(V.on_intercom(a))
            if m['f0'] > 0: rows.setdefault((who, (x[6] if len(x) > 6 else '') or 'real'), []).append(m)
med = lambda L, k: float(np.median([m[k] for m in L]))
print('who  kind    lines  pitch  range   F1    F2    F3   jitter shimmer  HNR  centre   (medians, measured in the intercom band)')
for who in ['CDR', 'GNR', 'LDR', 'DRV', 'HQ']:
    for kind in ['real', 'splice', 'synth', 'recorded']:
        L = rows.get((who, kind))
        if L: print('%-4s %-7s %4d   %4.0f  %5.1f  %4.0f  %4.0f  %4.0f   %4.1f   %4.1f   %4.1f  %5.0f' % (who, kind, len(L), med(L, 'f0'), med(L, 'f0_range'), med(L, 'f1'), med(L, 'f2'), med(L, 'f3'), med(L, 'jitter'), med(L, 'shimmer'), med(L, 'hnr'), med(L, 'centroid')))
real = {w: rows[(w, 'real')] for w in ['CDR', 'GNR', 'LDR', 'DRV'] if (w, 'real') in rows}
if len(real) == 4:
    order = sorted(real, key=lambda w: med(real[w], 'f1')); print('vocal tract, smallest formants first: ' + ' < '.join('%s (F1 %.0f, F2 %.0f)' % (w, med(real[w], 'f1'), med(real[w], 'f2')) for w in order))
p = os.path.join(W, 'voices_report.json')
if os.path.exists(p):
    R = json.load(open(p))['made']; syn = [r for r in R if r['how'] == 'synth']
    print('\nmade lines: %d synthesised (%d kept, %d dropped as unreadable), %d spliced' % (len(syn), sum(r['kept'] for r in syn), sum(not r['kept'] for r in syn), sum(r['how'] == 'splice' for r in R)))
    z = np.array([r['zmax'] for r in syn if r['kept']]); print('distance of the kept synthesised lines from the man\'s real lines (largest of nine measures, in standard deviations): median %.1f, 90%% under %.1f, over 2.5: %d of %d' % (np.median(z), np.percentile(z, 90), (z > 2.5).sum(), len(z)))
    import collections; print('measure that is furthest off, by count:', dict(collections.Counter(r['worst'] for r in syn if r['kept']).most_common()))
    if '--list' in sys.argv:
        for r in R: print('%-4s %-13s %d %-6s %s%s' % (r['who'], r['ev'], r['level'], r['how'], r['text'], ('   [z %.1f on %s; pitch %d against %d; read as: %s]%s' % (r['zmax'], r['worst'], r['f0'], r['f0_ref'], r['heard'][:40], '' if r['kept'] else ' DROPPED')) if r['how'] == 'synth' else ''))
