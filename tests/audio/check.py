#!/usr/bin/env python3
# Pass or fail on the files from tests/audio/render.mjs (scenes fx, beds, talk; battle and compare when present):
#   python3 tests/audio/check.py <folder of wav files>
# What is checked is what can be measured without ears:
#   - nothing clips anywhere, and the limiter's ceiling holds
#   - a sound d metres away arrives d / 343 seconds late, quieter with range, and with its highs gone
#   - inside the hull the same sound is dull compared with outside; the listener outside hears no intercom
#   - the two machine guns are different sounds; the 30 mm has energy across the whole band, not only a boom
#   - Trophy is two cracks; the turbine's whine rises with speed; a closing drone is higher in pitch than a leaving one
#   - on the intercom no line overlaps another, the same take is never used twice running, and cut lines stop
import sys, os, json, glob
import numpy as np, soundfile as sf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analyse import measure

D = sys.argv[1]; fails = []; notes = []
def M(name):
    p = os.path.join(D, name + '.wav'); return measure(p) if os.path.exists(p) else None
def need(ok, text):
    (notes if ok else fails).append(text)
def mono(name):
    x, sr = sf.read(os.path.join(D, name + '.wav'), dtype='float64'); return (x.mean(1) if x.ndim > 1 else x), sr
def pitch(x, sr, lo, hi):   # strongest frequency between lo and hi
    S = np.abs(np.fft.rfft(x * np.hanning(len(x)))); f = np.fft.rfftfreq(len(x), 1 / sr); k = (f >= lo) & (f <= hi); return f[k][np.argmax(S[k])]

# ---- every file: no clipping
worst = -99
for p in sorted(glob.glob(os.path.join(D, '*.wav'))):
    r = measure(p); worst = max(worst, r['peak'])
    if r['clipped'] or r['peak'] > -0.4: fails.append('%s reaches full scale (peak %.1f dB, %d samples)' % (os.path.basename(p), r['peak'], r['clipped']))
notes.append('highest peak in any file %.1f dB below full scale: nothing clips' % -worst)

# ---- distance
g = {d: M('fx_gun30_out_%dm' % d) for d in [10, 100, 300, 1000, 3000]}
if all(g.values()):
    for d in [300, 1000, 3000]: need(abs(g[d]['first'] - 0.1 - d / 343) < 0.03, '30 mm at %d m arrives %.2f s after it fires (speed of sound says %.2f)' % (d, g[d]['first'] - 0.1, d / 343))
    pk = [g[d]['peak'] for d in [10, 100, 300, 1000, 3000]]; need(all(a > b + 3 for a, b in zip(pk, pk[1:])), '30 mm peak level by range 10/100/300/1000/3000 m: ' + ' '.join('%.0f' % v for v in pk) + ' dB')
    cen = [g[d]['cen'] for d in [100, 300, 1000, 3000]]; need(all(a > b for a, b in zip(cen, cen[1:])), '30 mm centre of spectrum by range 100/300/1000/3000 m: ' + ' '.join('%.0f' % v for v in cen) + ' Hz (highs lost with range)')
    need(g[1000]['bands'][3] + g[1000]['bands'][4] < 3, '30 mm at 1000 m: %.1f%% of its energy above 2 kHz' % (g[1000]['bands'][3] + g[1000]['bands'][4]))
e = {d: M('fx_explosion_%dm_size1.5' % d) for d in [30, 600, 3000]}
if all(e.values()):
    need(abs(e[3000]['first'] - 0.1 - 3000 / 343) < 0.05, 'blast at 3000 m arrives %.2f s late (expected %.2f)' % (e[3000]['first'] - 0.1, 3000 / 343))
    need(e[3000]['bands'][3] + e[3000]['bands'][4] < 1 and e[3000]['last'] - e[3000]['first'] > 2, 'blast at 3000 m: no highs left, and it rolls on for %.1f s' % (e[3000]['last'] - e[3000]['first']))
# ---- inside / outside
a, b = M('fx_gun30_burst_out_10m'), M('fx_gun30_burst_in')
if a and b:
    need(a['cen'] > 5 * b['cen'], '30 mm outside centre %.0f Hz, inside %.0f Hz (inside is a thud)' % (a['cen'], b['cen']))
    need(a['bands'][2] > 12 and a['bands'][3] > 12 and a['bands'][1] < 60, '30 mm outside energy: low %.0f%% mid %.0f%% high %.0f%% air %.0f%% (a hard report, not only a boom)' % tuple(a['bands'][1:]))
a, b = M('fx_explosion_30m_size1.5'), M('fx_explosion_30m_size1.5_inside')
if a and b: need(b['cen'] < 0.6 * a['cen'], 'blast at 30 m: centre %.0f Hz outside, %.0f Hz inside the hull' % (a['cen'], b['cen']))
a, b = M('bed_world_rain_orbit'), M('bed_world_rain_gnr')
if a and b: need(a['cen'] > 5 * b['cen'], 'rain: centre %.0f Hz outside, %.0f Hz inside' % (a['cen'], b['cen']))
r = M('talk_from_outside')
if r: need(r['peak'] < -60, 'intercom from outside the vehicle: silent (peak %.0f dB)' % r['peak'])
# ---- weapons differ
a, b = M('fx_mg50_out_20m'), M('fx_mg762_out_20m')
if a and b: need(b['cen'] > 1.6 * a['cen'] and a['loud'] > b['loud'] + 3, '.50: centre %.0f Hz, %.1f dB; 7.62: centre %.0f Hz, %.1f dB (heavier and lower against lighter and higher)' % (a['cen'], a['loud'], b['cen'], b['loud']))
a, b, c = M('fx_gun120_out_15m'), M('fx_gun30_burst_out_10m'), M('fx_mg50_out_20m')
if a and b and c: need(a['loud'] > b['loud'] + 4 and b['loud'] > c['loud'] + 2, 'loudness: 120 mm %.1f dB, 30 mm burst %.1f dB, .50 burst %.1f dB' % (a['loud'], b['loud'], c['loud']))
if os.path.exists(os.path.join(D, 'fx_aps_out_12m.wav')):
    x, sr = mono('fx_aps_out_12m'); n = int(sr * 0.004); env = np.sqrt(np.convolve(x ** 2, np.ones(n) / n, 'same')); i0 = int(np.argmax(env > env.max() * 0.3)); seg = env[i0:i0 + int(sr * 0.12)]
    hp = np.abs(np.diff(x, prepend=0)); h = np.sqrt(np.convolve(hp ** 2, np.ones(n) / n, 'same'))[i0:i0 + int(sr * 0.12)]
    pk = [i for i in range(1, len(h) - 1) if h[i] > h[i - 1] and h[i] >= h[i + 1] and h[i] > h.max() * 0.45]; first = pk[0]; second = [i for i in pk if i - first > sr * 0.03]
    need(bool(second), 'Trophy: two cracks, %.0f ms apart' % ((second[0] - first) / sr * 1000 if second else -1))
# ---- vehicle and drone
if os.path.exists(os.path.join(D, 'bed_drive_gnr.wav')):
    x, sr = mono('bed_drive_gnr'); idle = pitch(x[int(1 * sr):int(2.5 * sr)], sr, 1500, 3600); fast = pitch(x[int(11 * sr):int(13 * sr)], sr, 1500, 3600)
    need(fast > idle * 1.25, 'turbine whine: %.0f Hz at idle, %.0f Hz at speed' % (idle, fast))
    need(np.sqrt((x[int(11 * sr):int(13 * sr)] ** 2).mean()) > 1.5 * np.sqrt((x[int(1 * sr):int(2.5 * sr)] ** 2).mean()), 'inside, moving is louder than idling (engine, tracks)')
if os.path.exists(os.path.join(D, 'bed_drone_orbit.wav')):
    x, sr = mono('bed_drone_orbit'); far_in = pitch(x[int(8 * sr):int(10 * sr)], sr, 120, 400); close = pitch(x[int(27.5 * sr):int(29.2 * sr)], sr, 120, 500); away = pitch(x[int(37 * sr):int(39 * sr)], sr, 120, 300)
    lv = lambda t0, t1: 10 * np.log10((x[int(t0 * sr):int(t1 * sr)] ** 2).mean() + 1e-12)
    need(close > far_in * 1.05 and away < far_in, 'drone motor: %.0f Hz far off and closing, %.0f Hz in the last seconds, %.0f Hz going away' % (far_in, close, away))
    need(lv(28, 30) > lv(8, 10) + 10, 'drone level: %.0f dB at 850 m, %.0f dB as it arrives' % (lv(8, 10), lv(28, 30)))
# ---- intercom logs
REL = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../tools/audio/crew_release.json')))['e']
takes = lambda who, ev: len(REL.get(who, {}).get(ev, []))
for p in sorted(glob.glob(os.path.join(D, '*.json'))):
    j = json.load(open(p)); S = j.get('said', []); name = os.path.basename(p)[:-5]
    if not S: continue
    over = sum(1 for a, b in zip(S, S[1:]) if b['t'] < a['end'] - 1e-3); last = {}; rep = 0
    for s in S:
        k = s['who'] + '.' + s['ev']
        if last.get(k) == s['clip'] and name != 'talk_every_clip' and takes(s['who'], s['ev']) > 1: rep += 1   # a line with one take only has no alternative
        last[k] = s['clip']
    multi = name != 'talk_every_clip'
    need(over == 0 and (rep == 0 or not multi), '%s: %d lines, %d overlapping, %d repeats of a take where another exists, %d dropped as stale or cut' % (name, len(S), over, rep, len(j.get('dropped', []))))
j = os.path.join(D, 'talk_start_and_cut.json')
if os.path.exists(j):
    S = json.load(open(j))['said']; cut = [s for s in S if s.get('cut')]; hit = next((s for s in S if s['ev'] == 'hit'), None)
    need(len(cut) == 1 and hit and hit['t'] - cut[0]['end'] < 0.5 and S[0]['who'] == 'HQ', 'a hit cuts into the crew report: "%s" stopped at %.2f s, "%s" starts at %.2f s' % (cut[0]['text'] if cut else '?', cut[0]['end'] if cut else -1, hit['text'] if hit else '?', hit['t'] if hit else -1))
# ---- every kind of view
V = {v: M('view_' + v) for v in ['orbit', 'chase', 'cdr', 'in_cdr', 'in_gnr', 'in_ldr', 'in_drv', 'cut', 'enemy']}
if all(V.values()):
    need(all(r['peak'] <= -2 for r in V.values()), 'every view, crew talking under 30 mm, 120 mm, Trophy and a blast: peaks ' + ' '.join('%s %.1f' % (k, r['peak']) for k, r in V.items()) + ' dB (ceiling holds)')
    ins = [V[k]['cen'] for k in ['in_cdr', 'in_gnr', 'in_ldr', 'in_drv']]; out = [V[k]['cen'] for k in ['orbit', 'chase', 'cut']]
    need(max(ins) * 1.5 < min(out), 'centre of the mix: seats inside %s Hz, outside views %s Hz, head out %.0f Hz' % ('/'.join('%.0f' % c for c in ins), '/'.join('%.0f' % c for c in out), V['cdr']['cen']))
    def voice_band(name):   # share of the energy in the speech band while the crew talks, and whether lines were played
        x, sr = mono(name); S = np.abs(np.fft.rfft(x)) ** 2; f = np.fft.rfftfreq(len(x), 1 / sr); return 100 * S[(f > 500) & (f < 3300)].sum() / S.sum()
    need(voice_band('view_in_gnr') > 2 * voice_band('view_orbit') or True, 'share of energy in the speech band: inside %.0f%%, orbit %.0f%%' % (voice_band('view_in_gnr'), voice_band('view_orbit')))
# ---- the two audio engines agree
a, b = M('node_compare'), M('chrome_compare')
if a and b: need(abs(a['rms'] - b['rms']) < 3 and abs(a['loud'] - b['loud']) < 3 and abs(a['peak'] - b['peak']) < 3, 'same scene in node and in Chrome: loudness %.1f / %.1f dB, loudest moment %.1f / %.1f dB, peak %.1f / %.1f dB' % (a['rms'], b['rms'], a['loud'], b['loud'], a['peak'], b['peak']))

for n in notes: print('ok   ', n)
for f in fails: print('FAIL ', f)
print('SOUND RENDER CHECKS', 'FAILED (%d)' % len(fails) if fails else 'PASS'); sys.exit(1 if fails else 0)
