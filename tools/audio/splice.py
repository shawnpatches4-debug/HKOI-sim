#!/usr/bin/env python3
# Cut single words out of the pack's two-word lines ("Load smoke!" -> "Smoke!", "Tank identified." -> "Tank!" and
# "Identified."), so that a few of the lines the pack lacks are still the pack's own human voice.
#   python3 -I tools/audio/splice.py <work dir> <Whisper model folder> <out dir>
# For each source clip the cut is placed at the quietest 10 ms between the two words (searched in the middle of the clip),
# each side is faded over 8 ms, and the piece is kept ONLY if the speech recogniser reads it as the wanted word on its
# own (as it is, and slowed down). Writes <out>/<WHO>.<event>.<clip>.wav and <out>/splices.json. Nobody has listened.
import sys, os, json, glob, re
import numpy as np, soundfile as sf, sherpa_onnx
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voicelib as V

W, M, OUT = sys.argv[1], sys.argv[2], sys.argv[3]; os.makedirs(OUT, exist_ok=True)
# [who, event, delivery, wanted word(s) as the recogniser may spell them, words shown, which side of the cut, source clips]
JOBS = [
    ['CDR', 'smoke', None, ['smoke'], 'Smoke!', 'tail', [176, 177, 178]],
    ['GNR', 'identified', None, ['identified', 'identify'], 'Identified.', 'tail', [226, 236, 246, 249, 252, 220, 222, 224, 228]],
    ['GNR', 'tank', None, ['tank'], 'Tank!', 'head', [226, 236, 246, 249, 252]],
    ['GNR', 'pc', None, ['pc', 'p c', 'pz', 'bc'], 'PC!', 'head', [220, 222, 224]],
    ['GNR', 'truck', None, ['truck'], 'Truck!', 'head', [223, 228, 255]],
    ['GNR', 'miss', None, ['miss', 'missed'], 'Miss.', 'head', [335, 341, 334, 340]],
]
cat = {c['i']: c for c in json.load(open(os.path.join(W, 'catalogue.json')))['clips']}
name = next(os.path.basename(p)[:-len('-encoder.onnx')] for p in glob.glob(os.path.join(M, '*-encoder.onnx')))
rec = sherpa_onnx.OfflineRecognizer.from_whisper(encoder='%s/%s-encoder.onnx' % (M, name), decoder='%s/%s-decoder.onnx' % (M, name), tokens='%s/%s-tokens.txt' % (M, name), num_threads=4, language='en', task='transcribe')
def hear(a, slow=False):
    if slow: a = V.run_ffmpeg(a, 'atempo=0.75')
    n = int(len(a) * 16000 / V.SR); b = np.interp(np.linspace(0, len(a) - 1, n), np.arange(len(a)), a).astype(np.float32); pad = np.zeros(6400, dtype=np.float32)
    s = rec.create_stream(); s.accept_waveform(16000, np.concatenate([pad, b / (np.abs(b).max() + 1e-9) * 0.7, pad])); rec.decode_stream(s); return s.result.text.strip()
norm = lambda t: re.sub(r'[^a-z ]', '', t.lower()).strip()

done = []
for who, ev, _, want, words, side, clips in JOBS:
    for c in clips:
        a = V.trim(V.load(os.path.join(W, 'ogg', '%04d.ogg' % c))); n = int(V.SR * 0.005); k = len(a) // n
        env = np.sqrt((a[:k * n].reshape(k, n) ** 2).mean(1)); sm = np.convolve(env, np.ones(2) / 2, 'same')
        lo, hi = (int(k * 0.15), int(k * 0.6)) if side == 'head' or ev == 'smoke' else (int(k * 0.2), int(k * 0.65))
        cut = (lo + int(np.argmin(sm[lo:hi]))) * n
        piece = a[:cut + n].copy() if side == 'head' else a[cut:].copy(); f = int(V.SR * 0.008)
        if len(piece) < V.SR * 0.18: continue
        piece[:f] *= np.linspace(0, 1, f); piece[-f:] *= np.linspace(1, 0, f)
        h1, h2 = norm(hear(piece)), norm(hear(piece, True)); ok = h1 in want and h2 in want
        depth = 20 * np.log10(sm[cut // n] / (env.max() + 1e-9) + 1e-9)
        print('%s %-4s %-11s clip %3d cut at %.2f of %.2f s (%.0f dB under the peak)  heard: %-14s slowed: %s' % ('KEEP' if ok else 'drop', who, ev, c, cut / V.SR, len(a) / V.SR, depth, h1, h2))
        if ok:
            p = os.path.join(OUT, '%s.%s.%d.wav' % (who, ev, c)); sf.write(p, piece, V.SR)
            done.append(dict(who=who, ev=ev, level=cat[c].get('level', 1), clip=c, words=words, file=os.path.basename(p), cut_db=round(float(depth), 1), heard=h1))
json.dump(done, open(os.path.join(OUT, 'splices.json'), 'w'), indent=1); print(len(done), 'splices kept')
