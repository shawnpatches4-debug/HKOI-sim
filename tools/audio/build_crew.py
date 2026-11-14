#!/usr/bin/env python3
# Cut the crew lines of the release build out of the unpacked voice pack, clip by clip, as listed by hand in a selection file.
#   python3 -I tools/audio/build_crew.py <work dir> <assets dir> [selection = tools/audio/crew_release.json] [kbps = 80]
# Reads  <work>/ogg/NNNN.ogg (fsb_unpack.py) and the selection: { prefix, e: { WHO: { event: [[clip, delivery, words], ...] } } }
# Writes <assets>/<prefix>_<speaker>.mp3  one strip per speaker (cdr, gnr, ldr, drv, any, hq), mono, 44.1 kHz
#        <assets>/<prefix>_index.json     { pack, strips: { key: file }, e: { WHO: { event: [[strip, start s, length s, delivery, clip, words], ...] } } }
# Every clip is trimmed of silence, set to the same loudness and given a short fade so the cuts do not click.
# It refuses to overwrite an existing file unless FORCE=1 is set. The strips are third-party audio: they stay out of git.
import sys, os, json, subprocess
import numpy as np, soundfile as sf

W, ASSETS = sys.argv[1], sys.argv[2]
SEL = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'crew_release.json')
KBPS = sys.argv[4] if len(sys.argv) > 4 else '80'
SR = 44100; GAP = 0.2; TARGET = -19.0; CEIL = -1.5   # speech loudness in dB below full scale; highest peak allowed
sel = json.load(open(SEL)); PRE = sel.get('prefix', 'crew2')

def load(i):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-i', os.path.join(W, 'ogg', '%04d.ogg' % i), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32).astype(np.float64)

def tidy(a):
    n = int(SR * 0.01); k = len(a) // n
    e = 20 * np.log10(np.sqrt((a[:k * n].reshape(k, n) ** 2).mean(1)) + 1e-9); on = np.nonzero(e > max(e.max() - 38, -60))[0]
    lo = max(0, on[0] * n - int(SR * 0.02)); hi = min(len(a), (on[-1] + 1) * n + int(SR * 0.06)); a = a[lo:hi].copy()
    loud = e[e > e.max() - 25]; rms = 10 * np.log10((10 ** (loud / 10)).mean())
    g = 10 ** ((TARGET - rms) / 20); pk = np.abs(a).max() * g; lim = 10 ** (CEIL / 20)
    if pk > lim: g *= lim / pk
    a *= g; f = int(SR * 0.006); a[:f] *= np.linspace(0, 1, f); a[-f:] *= np.linspace(1, 0, f)
    return a

strips = {}; index = {}; n = 0
for who, events in sel['e'].items():
    key = who.lower(); S = strips.setdefault(key, dict(parts=[], t=0.0))
    for ev, takes in events.items():
        for clip, level, words in takes:
            a = tidy(load(clip))
            index.setdefault(who, {}).setdefault(ev, []).append([key, round(S['t'], 3), round(len(a) / SR, 3), level, clip, words])
            S['parts'] += [a, np.zeros(int(SR * GAP))]; S['t'] += len(a) / SR + int(SR * GAP) / SR; n += 1
files = {}; total = 0
for key, S in sorted(strips.items()):
    name = '%s_%s.mp3' % (PRE, key); out = os.path.join(ASSETS, name)
    if os.path.exists(out) and not os.environ.get('FORCE'): sys.exit('refusing to overwrite ' + out + ' (set FORCE=1 to rebuild)')
    wav = os.path.join(W, name + '.wav'); sf.write(wav, np.concatenate(S['parts']).astype(np.float32), SR, subtype='PCM_16')
    subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-y', '-i', wav, '-ac', '1', '-c:a', 'libmp3lame', '-b:a', KBPS + 'k', out], check=True); os.remove(wav)
    files[key] = name; total += os.path.getsize(out); print('%-18s %6.1f s  %7.1f kB' % (name, S['t'], os.path.getsize(out) / 1024))
json.dump(dict(pack=sel['pack'], strips=files, e=index), open(os.path.join(ASSETS, PRE + '_index.json'), 'w'), separators=(',', ':'))
print('%d clips in %d strips, %.0f kB in all' % (n, len(files), total / 1024))
