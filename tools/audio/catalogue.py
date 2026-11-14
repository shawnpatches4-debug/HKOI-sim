#!/usr/bin/env python3
# Step 4 of the sound-pack pipeline: put everything known about each clip of a pack into one table.
#   python3 -I tools/audio/catalogue.py <work dir> <map.json>
# Reads   <work>/decode_meta.json   (fsb_unpack.py: sample rate and length of every clip)
#         <work>/transcripts.jsonl  (transcribe.py: what the speech recogniser heard)
#         <work>/features.json      (features.py: loudness, pitch, voice colour)
#         <map.json>                (written by hand: which clips are which line, who says it, which event it is)
# Writes  <work>/catalogue.json, <work>/catalogue.csv and <work>/catalogue_summary.txt
# Nobody has listened to the clips: "heard" is the machine's text, "line" is a person's reading of that text.
import sys, os, json, csv, collections

W, MAP = sys.argv[1], sys.argv[2]
meta = {m['i']: m for m in json.load(open(os.path.join(W, 'decode_meta.json')))}
heard = {}
for l in open(os.path.join(W, 'transcripts.jsonl')):
    r = json.loads(l); heard[r['i']] = r
F = {int(k): v for k, v in json.load(open(os.path.join(W, 'features.json'))).items()}
M = json.load(open(MAP)); use = M.get('use', {}); skip = set(M.get('not_in_strips', []))
cl = {}
if os.path.exists(os.path.join(W, 'clusters.json')): cl = {int(k): v for k, v in json.load(open(os.path.join(W, 'clusters.json'))).items()}

def cepd(a, b): return sum(abs(x - y) for x, y in zip(F[a]['cep'][1:], F[b]['cep'][1:])) / 12

rows = {}
for r in M['rows']:
    first, last, who, ev, line = r[:5]; guess = len(r) > 5 and bool(r[5])
    for i in range(first, last + 1):
        e = ev
        if ev == 'range': e = 'range_%d' % (1000 + 100 * (i - 195) if i <= 205 else 300 + 50 * (i - 206))   # the gunner's range calls, metres
        rows[i] = dict(i=i, who=who, event=e, line=line, guess=guess)
half = max(rows) + 1
out = []
for i in sorted(meta):
    f = F[i]; h = heard.get(i, {})
    c = dict(i=i, dur=f['dur'], hz=meta[i]['hz'], f0=f['f0'], rms=f['rms'], peak=f['peak'], group=cl.get(i), heard=h.get('text', ''))
    if 'dup' in f: c['copy_of'] = f['dup']   # the very same recording stored twice in the bank
    src = rows.get(i) or (rows.get(f.get('dup')) if 'dup' in f else None) or rows.get(i - half)
    if src: c.update(who=src['who'], event=src['event'], line=src['line'], guess=src['guess'])
    else: c.update(who='X', event='unknown', line='', guess=True)
    out.append(c)
# the same take stored again at another sample rate: same event, same length, same voice colour
by = collections.defaultdict(list)
for c in out:
    if 'copy_of' not in c: by[(c['who'], c['event'])].append(c)
for k, L in by.items():
    keep = []
    for c in sorted(L, key=lambda c: (-c['hz'], c['i'])):
        m = next((d for d in keep if abs(d['dur'] - c['dur']) <= 0.03 and cepd(d['i'], c['i']) < 0.4), None)
        if m: c['same_take_as'] = m['i']
        else: keep.append(c)
    # delivery level: no labels exist, so the takes of one line are ranked by voice pitch (assumption: higher pitch = more stressed)
    keep.sort(key=lambda c: (c['f0'] or 999, c['i']))
    for n, c in enumerate(keep): c['level'] = min(2, n * 3 // len(keep)) if len(keep) > 1 else 1
for c in out:
    key = '%s.%s' % (c['who'], c['event'].split('_')[0] if c['event'].startswith('range_') else c['event'])
    u = use.get(key); c['status'] = u[0] if u else ('none' if c['who'] in ('X',) else 'proposal'); c['sim_use'] = u[1] if u else ''
    c['in_strip'] = 'level' in c and c['who'] in ('CDR', 'GNR', 'LDR', 'DRV', 'ANY') and c['event'] not in skip
json.dump(dict(pack=M['pack'], clips=out), open(os.path.join(W, 'catalogue.json'), 'w'), indent=0)
cols = ['i', 'dur', 'hz', 'f0', 'rms', 'group', 'who', 'event', 'level', 'status', 'in_strip', 'copy_of', 'same_take_as', 'guess', 'line', 'heard', 'sim_use']
with open(os.path.join(W, 'catalogue.csv'), 'w', newline='') as fo:
    w = csv.writer(fo); w.writerow(cols)
    for c in out: w.writerow([c.get(k, '') for k in cols])
# a short readable summary
S = []; distinct = [c for c in out if 'copy_of' not in c]; takes = [c for c in distinct if 'same_take_as' not in c]
S.append('Pack %s: %d clips, %.1f minutes; %d distinct recordings (%.1f minutes); %d distinct takes after removing re-encoded repeats (%.1f minutes).' % (M['pack'], len(out), sum(c['dur'] for c in out) / 60, len(distinct), sum(c['dur'] for c in distinct) / 60, len(takes), sum(c['dur'] for c in takes) / 60))
S.append('Sample rates: ' + ', '.join('%d Hz x%d' % kv for kv in sorted(collections.Counter(c['hz'] for c in out).items())))
S.append('Not understood: %d takes. Reading marked as a guess: %d takes.' % (sum(1 for c in takes if c['who'] == 'X'), sum(1 for c in takes if c['guess'] and c['who'] != 'X')))
S.append('')
for who in ('CDR', 'GNR', 'LDR', 'DRV', 'ANY', 'HQ', 'X'):
    ev = collections.OrderedDict()
    for c in takes:
        if c['who'] == who: ev.setdefault(c['event'].split('_')[0] if c['event'].startswith('range_') else c['event'], []).append(c)
    S.append('%s: %d takes, %.0f s' % (who, sum(len(v) for v in ev.values()), sum(c['dur'] for v in ev.values() for c in v)))
    for e, v in ev.items():
        S.append('  %-18s %2d takes  %-9s clips %s  "%s"%s' % (e, len(v), v[0]['status'], ','.join(str(c['i']) for c in v[:6]) + ('..' if len(v) > 6 else ''), v[0]['line'][:70], ' (guess)' if v[0]['guess'] else ''))
open(os.path.join(W, 'catalogue_summary.txt'), 'w').write('\n'.join(S) + '\n')
print(S[0]); print('wrote catalogue.json, catalogue.csv, catalogue_summary.txt in', W)
