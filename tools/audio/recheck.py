#!/usr/bin/env python3
# Second opinion on clips whose reading is a guess: run the speech recogniser again on each clip as it is, slowed down, and
# with silence added around it (short shouts are often misheard at full speed), and print the readings side by side.
#   python3 -I tools/audio/recheck.py <work dir> <folder of the sherpa-onnx Whisper small.en model> <clip numbers or a-b ranges ...>
# Reads <work>/ogg/NNNN.ogg. Prints one line per clip. Nobody has listened: three readings that agree are still a machine's opinion.
import sys, os, glob, subprocess
import numpy as np, sherpa_onnx

W, M = sys.argv[1], sys.argv[2]
ids = []
for a in sys.argv[3:]:
    lo, _, hi = a.partition('-'); ids += list(range(int(lo), int(hi or lo) + 1))
name = next(os.path.basename(p)[:-len('-encoder.onnx')] for p in glob.glob(os.path.join(M, '*-encoder.onnx')))
rec = sherpa_onnx.OfflineRecognizer.from_whisper(encoder='%s/%s-encoder.onnx' % (M, name), decoder='%s/%s-decoder.onnx' % (M, name),
                                                 tokens='%s/%s-tokens.txt' % (M, name), num_threads=4, language='en', task='transcribe')

def load(i, flt=None):
    cmd = ['ffmpeg', '-v', 'error', '-nostdin', '-i', os.path.join(W, 'ogg', '%04d.ogg' % i)] + (['-af', flt] if flt else []) + ['-ac', '1', '-ar', '16000', '-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32)

def hear(x):
    s = rec.create_stream(); s.accept_waveform(16000, x); rec.decode_stream(s); return s.result.text.strip()

pad = np.zeros(8000, dtype=np.float32)
for i in ids:
    a = load(i)
    print('%4d %.1fs | %-28s | slow: %-28s | padded: %-28s | twice: %s' % (
        i, len(a) / 16000, hear(a), hear(load(i, 'atempo=0.7')), hear(np.concatenate([pad, a, pad])), hear(np.concatenate([pad, a, pad, a, pad]))))
