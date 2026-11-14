#!/usr/bin/env python3
# The crew's lines for a hit that gets inside: fire calls, "fire out", and each man's scream when he is wounded.
#   python3 -I tools/audio/build_panic.py <work dir> <assets dir> <Whisper model folder>
# Reads  <work>/ogg/NNNN.ogg            the unpacked human voice pack (fsb_unpack.py), as build_voices.py does
#        <assets>/screams.mp3 + voice_index.json (s.scream)   human screams (0 A.D., Wildfire Games, CC-BY-SA 3.0)
# Writes <assets>/crewpanic_<who>.mp3 and <assets>/crewpanic_index.json: an OVERLAY on crew4_index.json, in the same form
#        ({ overlay: true, strips: { key: file }, e: { WHO: { event: [[strip, start, length, level, clip, words, made], ...] } } }).
#        src/audio/intercom.js loads it after crew4 and adds its events. Nothing in crew4_* is touched.
# Every line here is a HUMAN recording: nothing is synthesised.
#   pack lines   clips of the pack that the earlier passes did not use (the pack's fire calls), re-voiced for their man exactly as
#                build_voices.py re-voices the pack (voicelib.py), trimmed and levelled. made: ''.
#   splice       "Fire! Fire!" cut out of the commander's own "Fire! Fire! Engine is burning!" (clip 434) at the quietest 10 ms
#                between the second "Fire!" and "Engine", kept only if the speech recogniser reads it as "fire fire". made: 'splice'.
#   scream       the 12 screams of screams.mp3 (one actor, not the pack's), three to each man, each put through that man's
#                re-voicing so the four do not scream with the same voice. made: 'scream'. They are a different person from the
#                pack actor; the re-voicing only keeps the four men apart.
# Nobody has listened to any of it.
import sys, os, json, glob, re, subprocess
import numpy as np, soundfile as sf
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import voicelib as V
W, ASSETS, WHI = sys.argv[1:4]; SR = V.SR; GAP = 0.2; PRE = 'crewpanic'
# [who, event, clip, level (the catalogue's delivery), words]: the words are the pack map's reading (tools/audio/crew_dialogs_ground_en_us.map.json)
PACK = [
    ['CDR', 'fire_engine', 434, 0, 'Fire! Fire! Engine is burning!'],
    ['CDR', 'fire_engine', 436, 1, 'The engine is on fire!'],
    ['CDR', 'smoke_turret', 435, 1, 'We have got smoke in the turret!'],
    ['CDR', 'fire_ammo', 480, 2, 'The ammo is on fire!'],
    ['CDR', 'fire_ammo', 481, 0, 'There is a fire in the ammo compartment.'],
    ['CDR', 'fire_out', 284, 0, 'Fire has been extinguished.'],
    ['CDR', 'fire_out', 439, 1, 'Fire extinguished!'],
    ['CDR', 'fire_out', 283, 2, 'Fire extinguished!'],
    ['DRV', 'engine_fire', 376, 1, 'TC, we have an engine fire. Pulling second shot.'],
    ['DRV', 'engine_fire', 377, 2, 'TC, we have an engine fire. Pulling second shot.'],
]
ROLES = ['CDR', 'GNR', 'LDR', 'DRV']
lines = {}
def add(who, ev, a, level, clip, words, how): lines.setdefault((who, ev), []).append(dict(a=a, level=level, clip=clip, words=words, made=how))
def pack(clip): return V.trim(V.load(os.path.join(W, 'ogg', '%04d.ogg' % clip)))
for who, ev, clip, lv, words in PACK: add(who, ev, V.level(V.trim(V.revoice(pack(clip), who))), lv, clip, words, '')
# ---- the splice, checked by the speech recogniser
import sherpa_onnx
name = next(os.path.basename(p)[:-len('-encoder.onnx')] for p in glob.glob(os.path.join(WHI, '*-encoder.onnx')))
rec = sherpa_onnx.OfflineRecognizer.from_whisper(encoder='%s/%s-encoder.onnx' % (WHI, name), decoder='%s/%s-decoder.onnx' % (WHI, name), tokens='%s/%s-tokens.txt' % (WHI, name), num_threads=4, language='en', task='transcribe')
def hear(a):
    n = int(len(a) * 16000 / SR); b = np.interp(np.linspace(0, len(a) - 1, n), np.arange(len(a)), a).astype(np.float32); pad = np.zeros(6400, dtype=np.float32)
    s = rec.create_stream(); s.accept_waveform(16000, np.concatenate([pad, b / (np.abs(b).max() + 1e-9) * 0.7, pad])); rec.decode_stream(s); return s.result.text.strip()
norm = lambda t: re.sub(r'[^a-z ]', ' ', t.lower()).split()
a = pack(434); n = int(SR * 0.005); k = len(a) // n
env = np.sqrt((a[:k * n].reshape(k, n) ** 2).mean(1)); sm = np.convolve(env, np.ones(2) / 2, 'same')
print('clip 434 as heard whole:', hear(a))
best = None
for lo_f, hi_f in ((0.3, 0.6), (0.25, 0.55), (0.35, 0.7)):   # the gap after the second "Fire!": the quietest stretch in the middle of the clip
    lo, hi = int(k * lo_f), int(k * hi_f); cut = (lo + int(np.argmin(sm[lo:hi]))) * n
    piece = a[:cut + n].copy(); f = int(SR * 0.008); piece[-f:] *= np.linspace(1, 0, f)
    got = hear(piece); w = norm(got); print('  cut at %.2f s of %.2f: heard %r' % (cut / SR, len(a) / SR, got))
    if w[:2] == ['fire', 'fire'] and len(w) == 2: best = piece; break
if best is not None: add('CDR', 'fire', V.level(V.trim(V.revoice(best, 'CDR'), 0.01, 0.03)), 1, 434, 'Fire! Fire!', 'splice'); print('splice kept: CDR fire "Fire! Fire!"')
else: print('splice NOT kept: the recogniser did not read "fire fire" on its own')
# ---- the screams, three to each man in his own voice treatment
vi = json.load(open(os.path.join(ASSETS, 'voice_index.json'))); S = V.load(os.path.join(ASSETS, 'screams.mp3'))
for i, (st, ln) in enumerate(vi['s']['scream']):
    who = ROLES[i % 4]; x = S[int(st * SR):int((st + ln) * SR)]
    add(who, 'scream', V.level(V.trim(V.revoice(x, who))), 2, 30000 + i, '(screams)', 'scream')
# ---- read back every line, write the strips
report = []
for (who, ev), L in sorted(lines.items()):
    for d in L:
        if d['made'] != 'scream': d['heard'] = hear(d['a']); report.append('%s %-12s %d %-7s %-48s heard: %s' % (who, ev, d['level'], d['made'] or 'pack', d['words'], d['heard']))
strips = {}; index = {}
for (who, ev), L in sorted(lines.items()):
    key = who.lower() + '_p'; St = strips.setdefault(key, dict(parts=[], t=0.0))
    for d in sorted(L, key=lambda d: d['level']):
        x = d['a']; index.setdefault(who, {}).setdefault(ev, []).append([key, round(St['t'], 3), round(len(x) / SR, 3), d['level'], d['clip'], d['words'], d['made']])
        St['parts'] += [x, np.zeros(int(SR * GAP))]; St['t'] += len(x) / SR + GAP
files = {}
for key, St in sorted(strips.items()):
    fn = '%s_%s.mp3' % (PRE, key.split('_')[0]); out = os.path.join(ASSETS, fn); wav = os.path.join(W, fn + '.wav')
    sf.write(wav, np.concatenate(St['parts']).astype(np.float32), SR, subtype='PCM_16')
    subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-y', '-i', wav, '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '80k', out], check=True); os.remove(wav)
    files[key] = fn; print('%-22s %6.1f s  %6.1f kB' % (fn, St['t'], os.path.getsize(out) / 1024))
json.dump(dict(overlay=True, pack='crew_dialogs_ground_en_us + screams (0 A.D.)', revoiced=True, strips=files, e=index), open(os.path.join(ASSETS, PRE + '_index.json'), 'w'), separators=(',', ':'))
print('\n'.join(report))
