#!/usr/bin/env python3
# Put "before" and "after" pictures side by side with labels, for showing a change at a glance.
# Usage: python3 tools/sidebyside.py <before dir> <after dir> <out dir> [name ...]
#   pairs every picture name found in both folders (or only the names given, without .png) and writes <out dir>/<name>.jpg
import os, sys
from PIL import Image, ImageDraw
before, after, out = sys.argv[1:4]; names = sys.argv[4:] or sorted(f[:-4] for f in os.listdir(after) if f.endswith('.png') and os.path.exists(os.path.join(before, f)))
os.makedirs(out, exist_ok=True)
for n in names:
    a = Image.open(os.path.join(before, n + '.png')).convert('RGB'); b = Image.open(os.path.join(after, n + '.png')).convert('RGB')
    if a.size != b.size: a = a.resize(b.size)
    w, h = b.size; sheet = Image.new('RGB', (w * 2 + 8, h), (0, 0, 0)); sheet.paste(a, (0, 0)); sheet.paste(b, (w + 8, 0))
    d = ImageDraw.Draw(sheet)
    for x, t in ((10, 'BEFORE'), (w + 18, 'AFTER')): d.rectangle((x - 4, h - 30, x + 78, h - 8), fill=(0, 0, 0)); d.text((x, h - 26), t, fill=(255, 255, 255))
    sheet.save(os.path.join(out, n + '.jpg'), quality=88); print(os.path.join(out, n + '.jpg'))
