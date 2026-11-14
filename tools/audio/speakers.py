#!/usr/bin/env python3
# Optional step of the sound-pack pipeline: guess WHICH VOICE ACTOR speaks each clip, so that one crewman can keep one voice.
#   python3 -I tools/audio/speakers.py <work dir> <speaker model .onnx> [number of voices to look for, default: chosen by the data]
# Reads  <work>/wav16/NNNN.wav (16 kHz copies made by transcribe.py) and <work>/catalogue.json
# Writes <work>/speakers.json: { "emb": { clip: [numbers] }, "voice": { clip: voice number }, "sizes": [...], "note": ... }
# The model is a speaker-verification network (wespeaker_en_voxceleb_resnet34.onnx from the "speaker-recongition-models" release
# of k2-fsa/sherpa-onnx on GitHub). It turns a clip into numbers that are close together for the same speaker. Very short clips
# (under 0.7 s: "Up!", "Left.") give poor numbers, so they are assigned to the nearest voice afterwards and marked "weak".
# Nobody has listened: this is a measurement, not a fact. Shouting moves a voice away from the same actor's calm takes.
import sys, os, json
import numpy as np, soundfile as sf, sherpa_onnx

W, MODEL = sys.argv[1], sys.argv[2]
K = int(sys.argv[3]) if len(sys.argv) > 3 else 0
cat = json.load(open(os.path.join(W, 'catalogue.json')))['clips']
ex = sherpa_onnx.SpeakerEmbeddingExtractor(sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=MODEL, num_threads=4))

def embed(i):
    x, sr = sf.read(os.path.join(W, 'wav16', '%04d.wav' % i), dtype='float32')
    if x.ndim > 1: x = x.mean(1)
    if len(x) < sr * 1.2: x = np.tile(x, int(np.ceil(sr * 1.2 / max(1, len(x)))))   # the network needs about a second of sound
    s = ex.create_stream(); s.accept_waveform(sr, x); s.input_finished()
    e = np.array(ex.compute(s), dtype=np.float64)
    return e / (np.linalg.norm(e) + 1e-9)

ids = [c['i'] for c in cat if 'copy_of' not in c]
emb = {i: embed(i) for i in ids}
dur = {c['i']: c['dur'] for c in cat}
strong = [i for i in ids if dur[i] >= 0.7]
X = np.array([emb[i] for i in strong])

# average-link clustering on cosine distance; the number of voices is where merging starts to join unlike groups
def cluster(X, k=0, stop=0.62):
    n = len(X); D = 1 - X @ X.T; np.fill_diagonal(D, 9); groups = {i: [i] for i in range(n)}
    while len(groups) > max(1, k):
        a, b = np.unravel_index(np.argmin(D), D.shape); d = D[a, b]
        if not k and d > stop: break
        na, nb = len(groups[a]), len(groups[b])
        row = (D[a] * na + D[b] * nb) / (na + nb)          # average link: the new group's distance to every other group
        D[a] = row; D[:, a] = row; D[a, a] = 9; D[b] = 9; D[:, b] = 9
        groups[a] += groups.pop(b)
    return list(groups.values())

G = cluster(X, K)
G = sorted([g for g in G], key=lambda g: -len(g))
big = [g for g in G if len(g) >= 4]
cent = [X[g].mean(0) / np.linalg.norm(X[g].mean(0)) for g in big]
voice, weak = {}, {}
for i in ids:
    sims = [float(emb[i] @ c) for c in cent]
    v = int(np.argmax(sims)); voice[i] = v
    weak[i] = bool(dur[i] < 0.7 or sims[v] < 0.35)
out = {'note': 'voice = guessed voice actor per clip (speaker-verification network, nobody listened); weak = too short or too far from every voice to trust',
       'sizes': [len(g) for g in big], 'voice': {str(i): voice[i] for i in ids}, 'weak': {str(i): weak[i] for i in ids},
       'sim': {str(i): [round(float(emb[i] @ c), 3) for c in cent] for i in ids}}
json.dump(out, open(os.path.join(W, 'speakers.json'), 'w'))
print('voices found:', len(big), 'sizes', out['sizes'], 'clips in small groups:', sum(len(g) for g in G if len(g) < 4))
by = {}
for c in cat:
    if 'copy_of' in c: continue
    by.setdefault((c['who'], c['event']), []).append('%d%s' % (voice[c['i']], '?' if weak[c['i']] else ''))
for k in sorted(by): print('%-4s %-18s %s' % (k[0], k[1], ' '.join(by[k])))
