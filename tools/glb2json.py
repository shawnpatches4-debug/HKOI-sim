#!/usr/bin/env python3
# The publishing service does not serve .glb files. Repack a .glb as a single .json glTF with its binary part embedded.
import sys, json, struct, base64
src, dst = sys.argv[1], sys.argv[2]
f = open(src, 'rb'); magic, ver, ln = struct.unpack('<4sII', f.read(12)); assert magic == b'glTF'
clen, ctype = struct.unpack('<I4s', f.read(8)); j = json.loads(f.read(clen)); blen, btype = struct.unpack('<I4s', f.read(8)); b = f.read(blen)
j['buffers'][0]['uri'] = 'data:application/octet-stream;base64,' + base64.b64encode(b[:j['buffers'][0]['byteLength']]).decode()
open(dst, 'w').write(json.dumps(j, separators=(',', ':'))); print(dst, len(b))
