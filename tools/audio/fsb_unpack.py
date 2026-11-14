#!/usr/bin/env python3
# Step 1 of the sound-pack pipeline: unpack an FMOD sound bank (.bank holding one FSB5 block) into one .ogg per clip.
#   python3 -I tools/audio/fsb_unpack.py <file.bank> <work dir> <folder holding the python-fsb5 "fsb5" package>
# Writes <work>/ogg/NNNN.ogg and <work>/decode_meta.json (sample rate, channels, length of every clip).
# The bank is somebody else's file: keep it in its own folder, run this from another folder, always with -I.
# python-fsb5: use the current sources from its repository (HearthSim/python-fsb5); the 1.0 release on PyPI does not build
# and lacks some Vorbis headers (16 clips of the crew pack would not decode with it). It needs libogg and libvorbis installed.
import sys, os, json
bank, W, lib = sys.argv[1], sys.argv[2], sys.argv[3]
sys.path.insert(0, lib)
import fsb5
data = open(bank, 'rb').read(); off = data.find(b'FSB5')
if off < 0: sys.exit('no FSB5 block in this file')
f = fsb5.FSB5(data[off:]); os.makedirs(os.path.join(W, 'ogg'), exist_ok=True); meta = []; bad = 0
for i, s in enumerate(f.samples):
    try:
        open(os.path.join(W, 'ogg', '%04d.%s' % (i, f.get_sample_extension())), 'wb').write(f.rebuild_sample(s))
        meta.append(dict(i=i, name=s.name, hz=s.frequency, ch=s.channels, n=s.samples))
    except Exception as e:
        bad += 1; meta.append(dict(i=i, err=str(e)[:120]))
json.dump(meta, open(os.path.join(W, 'decode_meta.json'), 'w'))
ok = [m for m in meta if 'n' in m]
print('FSB5 block at byte %d, codec %s: %d clips, %d decoded, %d failed' % (off, f.header.mode, len(meta), len(ok), bad))
print('sample rates', sorted(set(m['hz'] for m in ok)), 'channels', sorted(set(m['ch'] for m in ok)), 'minutes %.2f' % (sum(m['n'] / m['hz'] for m in ok) / 60), 'named' if any(m['name'] != '%04d' % m['i'] for m in ok) else 'no names in the bank')
