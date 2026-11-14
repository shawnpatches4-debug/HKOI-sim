#!/usr/bin/env python3
# Step 2 of the sound-pack pipeline: speech to text for every clip (nobody can listen in this workspace).
#   python3 -I tools/audio/transcribe.py <work dir> <folder of the sherpa-onnx Whisper small.en model>
# Needs: pip install sherpa-onnx soundfile numpy; ffmpeg. The model is the archive sherpa-onnx-whisper-small.en.tar.bz2 from the
# "asr-models" release of k2-fsa/sherpa-onnx on GitHub (huggingface.co and openaipublic.azureedge.net are blocked here).
# Writes <work>/wav16/NNNN.wav (16 kHz copies) and <work>/transcripts.jsonl, one line per clip: { i, text, dur } and, for a
# recording the bank stores twice, dup = the first clip with the same bytes (it is recognised only once).
# Safe to stop and start again: clips already in transcripts.jsonl are skipped. About one minute of work per minute of speech.
import sys, os, json, glob, hashlib, subprocess
import soundfile as sf, sherpa_onnx
W, M = sys.argv[1], sys.argv[2]; out = os.path.join(W, 'transcripts.jsonl'); os.makedirs(os.path.join(W, 'wav16'), exist_ok=True)
for f in sorted(glob.glob(os.path.join(W, 'ogg', '*.ogg'))):
    w = os.path.join(W, 'wav16', os.path.basename(f)[:-4] + '.wav')
    if not os.path.exists(w) or not os.path.getsize(w): subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-y', '-i', f, '-ac', '1', '-ar', '16000', w], check=True)
digest = lambda i: hashlib.md5(open(os.path.join(W, 'ogg', '%04d.ogg' % i), 'rb').read()).hexdigest()
done = set(); seen = {}
for l in (open(out) if os.path.exists(out) else []):
    r = json.loads(l); done.add(r['i']); seen.setdefault(digest(r['i']), r)
name = next(os.path.basename(p)[:-len('-encoder.onnx')] for p in glob.glob(os.path.join(M, '*-encoder.onnx')))
rec = sherpa_onnx.OfflineRecognizer.from_whisper(encoder='%s/%s-encoder.onnx' % (M, name), decoder='%s/%s-decoder.onnx' % (M, name), tokens='%s/%s-tokens.txt' % (M, name), num_threads=3, language='en', task='transcribe')
fo = open(out, 'a')
for f in sorted(glob.glob(os.path.join(W, 'wav16', '*.wav'))):
    i = int(os.path.basename(f)[:4])
    if i in done: continue
    h = digest(i)
    if h in seen: fo.write(json.dumps(dict(seen[h], i=i, dup=seen[h]['i'])) + '\n'); fo.flush(); continue
    a, sr = sf.read(f, dtype='float32'); s = rec.create_stream(); s.accept_waveform(sr, a); rec.decode_stream(s)
    r = dict(i=i, text=s.result.text.strip(), dur=round(len(a) / sr, 3)); seen[h] = r; fo.write(json.dumps(r) + '\n'); fo.flush()
print('transcripts for', sum(1 for l in open(out)), 'clips in', out)
