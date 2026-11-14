# python3 tests/motion/table.py < metrics.json : the motion numbers as a short table (from harness.mjs metrics or seq.py NUM=1)
import json, sys
t = sys.stdin.read(); d = json.loads(t[t.index('{'):t.rindex('}') + 1])
print('story              change of speed in one 1/60 s frame, m/s (when)                                   foot slide cm    low foot cm')
print('                   hips        head        l.hand      r.hand      l.foot      r.foot                worst  mean      high   low')
for n, s in d['stories'].items():
    v = ''.join('%5.2f@%-5.1f ' % (s['dvel'][k], s['where'][k]) for k in ['Hips', 'Head', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot'])
    lf = s.get('low_foot_cm'); print('%-18s %s   %6.2f@%-4s %5.2f   %s %s' % (n, v, s['foot_slide_cm']['worst'], s['foot_slide_cm'].get('when', ''), s['foot_slide_cm']['mean'], ('%6.1f %5.1f' % (lf['highest'], lf['lowest'])) if lf else '     -     -', s['err'] or ''))
if d.get('rates'): print('same story at 30/60/144/240 fps, largest difference from 240 fps (cm):', json.dumps(d['rates']))
if d.get('cost_ms'): print('cost per team per frame (ms):', json.dumps(d['cost_ms']))
